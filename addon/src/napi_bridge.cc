#include <napi.h>
#include "pmu_decoder.h"
#include <memory>
#include <thread>
#include <mutex>
#include <queue>
#include <chrono>

namespace pmu {
namespace napi_bridge {

class PMUDecoderWrapper : public Napi::ObjectWrap<PMUDecoderWrapper> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    PMUDecoderWrapper(const Napi::CallbackInfo& info);
    ~PMUDecoderWrapper();

private:
    static Napi::FunctionReference constructor;

    Napi::Value Start(const Napi::CallbackInfo& info);
    Napi::Value Stop(const Napi::CallbackInfo& info);
    Napi::Value IsRunning(const Napi::CallbackInfo& info);
    void SetCallback(const Napi::CallbackInfo& info);

    void DataCallback(const PhasorData& data);
    void EmitData();

    std::unique_ptr<PMUDecoder> decoder_;
    Napi::ThreadSafeFunction tsfn_;

    std::mutex queue_mutex_;
    std::queue<PhasorData> data_queue_;
    std::atomic<bool> has_callback_;
};

Napi::FunctionReference PMUDecoderWrapper::constructor;

Napi::Object PMUDecoderWrapper::Init(Napi::Env env, Napi::Object exports) {
    Napi::HandleScope scope(env);

    Napi::Function func = DefineClass(env, "PMUDecoder", {
        InstanceMethod("start", &PMUDecoderWrapper::Start),
        InstanceMethod("stop", &PMUDecoderWrapper::Stop),
        InstanceMethod("isRunning", &PMUDecoderWrapper::IsRunning),
        InstanceMethod("setCallback", &PMUDecoderWrapper::SetCallback)
    });

    constructor = Napi::Persistent(func);
    constructor.SuppressDestruct();

    exports.Set("PMUDecoder", func);
    return exports;
}

PMUDecoderWrapper::PMUDecoderWrapper(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<PMUDecoderWrapper>(info),
      decoder_(std::make_unique<PMUDecoder>()),
      has_callback_(false) {
}

PMUDecoderWrapper::~PMUDecoderWrapper() {
    if (decoder_) {
        decoder_->stop();
    }
    if (tsfn_) {
        tsfn_.Release();
    }
}

Napi::Value PMUDecoderWrapper::Start(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 2) {
        Napi::TypeError::New(env, "Expected at least 2 arguments: multicastAddress and port")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string multicast_addr = info[0].As<Napi::String>().Utf8Value();
    uint16_t port = static_cast<uint16_t>(info[1].As<Napi::Number>().Uint32Value());
    std::string interface = "0.0.0.0";

    if (info.Length() >= 3 && info[2].IsString()) {
        interface = info[2].As<Napi::String>().Utf8Value();
    }

    bool result = decoder_->start(multicast_addr, port, interface);

    if (result) {
        decoder_->set_callback([this](const PhasorData& data) {
            this->DataCallback(data);
        });
    }

    return Napi::Boolean::New(env, result);
}

Napi::Value PMUDecoderWrapper::Stop(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    decoder_->stop();
    return env.Undefined();
}

Napi::Value PMUDecoderWrapper::IsRunning(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    return Napi::Boolean::New(env, decoder_->is_running());
}

void PMUDecoderWrapper::SetCallback(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsFunction()) {
        Napi::TypeError::New(env, "Expected a function argument")
            .ThrowAsJavaScriptException();
        return;
    }

    if (tsfn_) {
        tsfn_.Release();
    }

    Napi::Function callback = info[0].As<Napi::Function>();
    tsfn_ = Napi::ThreadSafeFunction::New(
        env, callback, "PMU Data Callback", 0, 1, this,
        [](Napi::Env, void*, PMUDecoderWrapper* wrapper) {
        },
        static_cast<void*>(this),
        [](Napi::Env) {
        }
    );

    has_callback_ = true;
}

void PMUDecoderWrapper::DataCallback(const PhasorData& data) {
    if (!has_callback_) return;

    PhasorData* data_ptr = new PhasorData(data);

    napi_status status = tsfn_.BlockingCall(
        data_ptr,
        [](Napi::Env env, Napi::Function jsCallback, PhasorData* data) {
            Napi::HandleScope scope(env);

            Napi::Object obj = Napi::Object::New(env);
            obj.Set("stationId", Napi::String::New(env, data->station_id));
            obj.Set("timestamp", Napi::Number::New(env, 
                static_cast<double>(data->timestamp)));
            obj.Set("frequency", Napi::Number::New(env, data->frequency));
            obj.Set("freqDeviation", Napi::Number::New(env, data->freq_deviation));
            obj.Set("rocof", Napi::Number::New(env, data->rocof));
            obj.Set("dataQuality", Napi::Number::New(env, 
                static_cast<uint32_t>(data->data_quality)));
            obj.Set("pmuId", Napi::Number::New(env, 
                static_cast<uint32_t>(data->pmu_id)));

            Napi::Array phasors = Napi::Array::New(env, data->phasors.size());
            for (size_t i = 0; i < data->phasors.size(); ++i) {
                Napi::Object phasor = Napi::Object::New(env);
                phasor.Set("name", Napi::String::New(env, data->phasors[i].name));
                phasor.Set("magnitude", Napi::Number::New(env, data->phasors[i].magnitude));
                phasor.Set("angle", Napi::Number::New(env, data->phasors[i].angle));
                phasor.Set("type", Napi::String::New(env, 
                    data->phasors[i].is_voltage ? "voltage" : "current"));
                phasors.Set(i, phasor);
            }
            obj.Set("phasors", phasors);

            Napi::Array analogs = Napi::Array::New(env, data->analogs.size());
            for (size_t i = 0; i < data->analogs.size(); ++i) {
                analogs.Set(i, Napi::Number::New(env, data->analogs[i]));
            }
            obj.Set("analogs", analogs);

            Napi::Array digitals = Napi::Array::New(env, data->digitals.size());
            for (size_t i = 0; i < data->digitals.size(); ++i) {
                digitals.Set(i, Napi::Boolean::New(env, data->digitals[i]));
            }
            obj.Set("digitals", digitals);

            jsCallback.Call({obj});

            delete data;
        }
    );

    if (status != napi_ok) {
        delete data_ptr;
    }
}

} // namespace napi_bridge
} // namespace pmu

NODE_API_MODULE(pmu_decoder, pmu::napi_bridge::PMUDecoderWrapper::Init)
