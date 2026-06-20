{
  "targets": [
    {
      "target_name": "pmu_decoder",
      "sources": [
        "src/pmu_decoder.cc",
        "src/udp_listener.cc",
        "src/c37118_decoder.cc",
        "src/napi_bridge.cc"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "include"
      ],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "cflags": ["-fPIC", "-std=c++17"],
      "cflags_cc": ["-fPIC", "-std=c++17"],
      "msvs_settings": {
        "VCCLCompilerTool": {
          "AdditionalOptions": ["/std:c++17", "/EHsc"]
        }
      },
      "conditions": [
        ["OS=='win'", {
          "libraries": ["-lws2_32", "-liphlpapi"]
        }],
        ["OS=='linux'", {
          "libraries": ["-lpthread"]
        }]
      ]
    }
  ]
}
