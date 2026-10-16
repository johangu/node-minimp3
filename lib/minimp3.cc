#define MINIMP3_IMPLEMENTATION
#define MINIMP3_NO_STDIO

#include "minimp3_ex.h"
#include <napi.h>

#include <algorithm>
#include <climits>
#include <cstdint>
#include <vector>

namespace {

// Streaming MP3 decoder. Input arrives in arbitrary chunks, output is
// interleaved signed 16-bit PCM.
//
// Bytes are buffered in `pending_` until MINIMP3_BUF_SIZE are available, which
// is what minimp3 needs to validate frame sync. The remainder is decoded by
// flush().
class Decoder : public Napi::ObjectWrap<Decoder> {
 public:
  static Napi::Function GetClass(Napi::Env env) {
    return DefineClass(env, "Decoder",
                       {InstanceMethod<&Decoder::Write>("write"),
                        InstanceMethod<&Decoder::Flush>("flush"),
                        InstanceAccessor<&Decoder::Format>("format")});
  }

  explicit Decoder(const Napi::CallbackInfo &info)
      : Napi::ObjectWrap<Decoder>(info) {
    mp3dec_init(&dec_);
  }

 private:
  enum class State {
    DetectTag,   // waiting for enough bytes to look for an ID3v2 tag
    SkipTag,     // dropping the bytes of an ID3v2 tag
    FirstFrame,  // locating the first frame, reading format and VBR/LAME tag
    Streaming
  };

  Napi::Value Write(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsBuffer()) {
      Napi::TypeError::New(env, "Expected a Buffer").ThrowAsJavaScriptException();
      return env.Null();
    }
    if (closed_) return Fail(env, "Decoder is closed");

    auto buf = info[0].As<Napi::Buffer<uint8_t>>();
    pending_.insert(pending_.end(), buf.Data(), buf.Data() + buf.Length());
    return Run(env, false);
  }

  Napi::Value Flush(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (closed_) return Fail(env, "Decoder is closed");
    return Run(env, true);
  }

  // { sampleRate, channels } once the first frame has been seen, else null.
  Napi::Value Format(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (!hz_) return env.Null();
    Napi::Object format = Napi::Object::New(env);
    format.Set("sampleRate", hz_);
    format.Set("channels", channels_);
    return format;
  }

  Napi::Value Fail(Napi::Env env, const char *message) {
    closed_ = true;
    Napi::Error::New(env, message).ThrowAsJavaScriptException();
    return env.Null();
  }

  Napi::Value Run(Napi::Env env, bool flush) {
    const char *error = Process(flush);
    if (flush) closed_ = true;
    if (error) return Fail(env, error);

    auto pcm = Napi::Buffer<uint8_t>::Copy(
        env, reinterpret_cast<const uint8_t *>(out_.data()),
        out_.size() * sizeof(mp3d_sample_t));
    out_.clear();
    return pcm;
  }

  // Decodes as much of `pending_` as possible into `out_`. Returns an error
  // message, or nullptr.
  const char *Process(bool flush) {
    if (flush) {
      size_t size = pending_.size();
      mp3dec_skip_id3v1(pending_.data(), &size);
      pending_.resize(size);
    }

    size_t pos = 0;
    const char *error = nullptr;
    for (;;) {
      const uint8_t *p = pending_.data() + pos;
      const size_t have = pending_.size() - pos;

      if (state_ == State::DetectTag) {
        if (have < MINIMP3_ID3_DETECT_SIZE && !flush) break;
        tag_bytes_left_ = mp3dec_skip_id3v2(p, have);
        state_ = tag_bytes_left_ ? State::SkipTag : State::FirstFrame;
        continue;
      }
      if (state_ == State::SkipTag) {
        const size_t n = std::min(tag_bytes_left_, have);
        pos += n;
        tag_bytes_left_ -= n;
        if (tag_bytes_left_) break;
        state_ = State::FirstFrame;
        continue;
      }

      if (!have || (!flush && have < MINIMP3_BUF_SIZE)) break;
      const int avail = static_cast<int>(std::min<size_t>(have, INT_MAX));

      if (state_ == State::FirstFrame) {
        int free_format_bytes = 0, frame_size = 0;
        const int offset =
            mp3d_find_frame(p, avail, &free_format_bytes, &frame_size);
        if (!frame_size) {
          // No frame in the window. Drop it, keeping a tail in case a frame
          // starts there.
          pos += flush ? have : have - std::min<size_t>(have, 4096);
          continue;
        }
        pos += offset;
        ReadFirstFrame(p + offset, frame_size, &pos);
        state_ = State::Streaming;
        continue;
      }

      mp3dec_frame_info_t frame;
      const int samples = mp3dec_decode_frame(&dec_, p, avail, pcm_, &frame);
      pos += frame.frame_bytes;
      if (samples) {
        if (frame.hz != hz_ || frame.channels != channels_ ||
            frame.layer != layer_) {
          error = "Unsupported change of sample rate, channels or layer";
          break;
        }
        Emit(static_cast<size_t>(samples) * channels_);
      } else if (!frame.frame_bytes) {
        // Incomplete frame. Nothing more will arrive after a flush.
        if (flush) pos = pending_.size();
        break;
      }
    }

    pending_.erase(pending_.begin(), pending_.begin() + pos);
    return error;
  }

  // Reads the format from the first frame. If it is a Xing/Info tag frame, it
  // holds no audio: consume it and set up trimming of encoder delay/padding so
  // the output is gapless, as mp3dec_load_buf does.
  void ReadFirstFrame(const uint8_t *hdr, int frame_size, size_t *pos) {
    channels_ = HDR_IS_MONO(hdr) ? 1 : 2;
    hz_ = hdr_sample_rate_hz(hdr);
    layer_ = 4 - HDR_GET_LAYER(hdr);
    if (layer_ != 3) return;

    uint32_t frames;
    int delay, padding;
    const int tag = mp3dec_check_vbrtag(hdr, frame_size, &frames, &delay, &padding);
    if (tag > 0) {
      const int64_t skip = static_cast<int64_t>(delay) * channels_;
      const int64_t cut = static_cast<int64_t>(padding) * channels_;
      int64_t total = static_cast<int64_t>(hdr_frame_samples(hdr)) * channels_ *
                      static_cast<int64_t>(frames);
      if (total >= skip) total -= skip;
      if (cut > 0 && total >= cut) total -= cut;
      to_skip_ = static_cast<uint64_t>(skip);
      total_samples_ = static_cast<uint64_t>(total);
    }
    if (tag) *pos += frame_size;
  }

  // Appends `count` decoded samples from pcm_ to the output.
  void Emit(size_t count) {
    const mp3d_sample_t *src = pcm_;
    const size_t skip = std::min<uint64_t>(count, to_skip_);
    to_skip_ -= skip;
    src += skip;
    count -= skip;
    if (total_samples_) {
      count = std::min<uint64_t>(count, total_samples_ - std::min(emitted_, total_samples_));
    }
    out_.insert(out_.end(), src, src + count);
    emitted_ += count;
  }

  State state_ = State::DetectTag;
  bool closed_ = false;
  mp3dec_t dec_;
  std::vector<uint8_t> pending_;
  std::vector<mp3d_sample_t> out_;
  mp3d_sample_t pcm_[MINIMP3_MAX_SAMPLES_PER_FRAME];

  size_t tag_bytes_left_ = 0;
  int hz_ = 0, channels_ = 0, layer_ = 0;
  uint64_t to_skip_ = 0;        // leading samples to drop (encoder delay)
  uint64_t total_samples_ = 0;  // expected sample count from the VBR tag, or 0
  uint64_t emitted_ = 0;
};

}  // namespace

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("Decoder", Decoder::GetClass(env));
  return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init)
