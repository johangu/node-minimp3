{
  "targets": [
    {
      "target_name": "minimp3",
      "sources": [ "lib/minimp3.cc" ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "lib/"
      ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "defines": [ "NAPI_VERSION=8", "NAPI_DISABLE_CPP_EXCEPTIONS" ],
      "conditions": [
        # Prebuilt binaries must not depend on the libstdc++ of the build machine
        [ "OS=='linux'", { "ldflags": [ "-static-libstdc++", "-static-libgcc" ] } ]
      ]
    }
  ]
}
