#define MINIMP3_IMPLEMENTATION

#include "minimp3_ex.h"
#include <napi.h>

Napi::Value DecodeBuffer(const Napi::CallbackInfo &info) {
  uint8_t *buf = info[0].As<Napi::Buffer<uint8_t>>().Data();
  int buf_size = info[1].As<Napi::Number>().Int32Value();
  mp3dec_t mp3d;
  mp3dec_file_info_t f_info;

  mp3dec_load_buf(&mp3d, buf, buf_size, &f_info, 0, 0);
  return Napi::Buffer<mp3d_sample_t>::New(
      info.Env(), f_info.buffer, f_info.samples - sizeof(mp3d_sample_t));
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set(Napi::String::New(env, "decodeBuffer"),
              Napi::Function::New(env, DecodeBuffer));
  return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init);
