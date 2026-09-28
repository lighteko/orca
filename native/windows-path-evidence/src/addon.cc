#include <napi.h>
#include <windows.h>

#include <algorithm>
#include <string>
#include <utility>
#include <vector>

namespace {

constexpr size_t kDeviceTargetInitialChars = 1024;
constexpr size_t kDeviceTargetMaxChars = 65536;
constexpr size_t kWindowsPathMaxChars = 32767;

class QueryDosDeviceWorker final : public Napi::AsyncWorker {
 public:
  QueryDosDeviceWorker(Napi::Env env, std::u16string drive)
      : Napi::AsyncWorker(env),
        deferred_(Napi::Promise::Deferred::New(env)),
        drive_(std::move(drive)) {}

  Napi::Promise GetPromise() { return deferred_.Promise(); }

  void Execute() override {
    std::vector<WCHAR> target(kDeviceTargetInitialChars, L'\0');
    while (target.size() <= kDeviceTargetMaxChars) {
      const DWORD count = QueryDosDeviceW(reinterpret_cast<LPCWSTR>(drive_.c_str()), target.data(),
                                          static_cast<DWORD>(target.size()));
      if (count != 0) {
        // QueryDosDeviceW places the current mapping first; older mappings follow it.
        const auto terminator = std::find(target.begin(), target.begin() + count, L'\0');
        const size_t currentLength = static_cast<size_t>(terminator - target.begin());
        if (terminator == target.begin() + count || currentLength == 0) {
          return;
        }
        currentTarget_.assign(reinterpret_cast<const char16_t*>(target.data()), currentLength);
        succeeded_ = true;
        return;
      }
      if (GetLastError() != ERROR_INSUFFICIENT_BUFFER || target.size() == kDeviceTargetMaxChars) {
        return;
      }
      target.resize(std::min(target.size() * 2, kDeviceTargetMaxChars), L'\0');
    }
  }

  void OnOK() override {
    if (succeeded_) {
      deferred_.Resolve(Napi::String::New(Env(), reinterpret_cast<const char16_t*>(currentTarget_.c_str())));
    } else {
      deferred_.Resolve(Env().Null());
    }
  }

  void OnError(const Napi::Error&) override { deferred_.Resolve(Env().Null()); }

 private:
  Napi::Promise::Deferred deferred_;
  std::u16string drive_;
  std::u16string currentTarget_;
  bool succeeded_ = false;
};

class InspectPathEntryWorker final : public Napi::AsyncWorker {
 public:
  InspectPathEntryWorker(Napi::Env env, std::u16string path)
      : Napi::AsyncWorker(env),
        deferred_(Napi::Promise::Deferred::New(env)),
        path_(std::move(path)) {}

  Napi::Promise GetPromise() { return deferred_.Promise(); }

  void Execute() override {
    HANDLE handle = CreateFileW(
        reinterpret_cast<LPCWSTR>(path_.c_str()), FILE_READ_ATTRIBUTES,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr, OPEN_EXISTING,
        FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, nullptr);
    if (handle == INVALID_HANDLE_VALUE) {
      const DWORD error = GetLastError();
      status_ = error == ERROR_FILE_NOT_FOUND ? kMissing : kUnavailable;
      return;
    }

    FILE_ATTRIBUTE_TAG_INFO info{};
    const BOOL queried = GetFileInformationByHandleEx(handle, FileAttributeTagInfo, &info, sizeof(info));
    CloseHandle(handle);
    if (!queried) {
      status_ = kUnavailable;
      return;
    }
    attributes_ = info.FileAttributes;
    reparseTag_ = info.ReparseTag;
    status_ = kEntry;
  }

  void OnOK() override {
    Napi::Object result = Napi::Object::New(Env());
    if (status_ == kEntry) {
      result.Set("status", "entry");
      result.Set("attributes", Napi::Number::New(Env(), attributes_));
      result.Set("reparseTag", Napi::Number::New(Env(), reparseTag_));
    } else if (status_ == kMissing) {
      result.Set("status", "missing");
    } else {
      result.Set("status", "unavailable");
    }
    deferred_.Resolve(result);
  }

  void OnError(const Napi::Error&) override {
    Napi::Object result = Napi::Object::New(Env());
    result.Set("status", "unavailable");
    deferred_.Resolve(result);
  }

 private:
  static constexpr int kUnavailable = 0;
  static constexpr int kEntry = 1;
  static constexpr int kMissing = 2;
  Napi::Promise::Deferred deferred_;
  std::u16string path_;
  DWORD attributes_ = 0;
  DWORD reparseTag_ = 0;
  int status_ = kUnavailable;
};

Napi::Value QueryDosDeviceTarget(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() != 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "queryDosDeviceTarget(drive: string)").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  std::u16string drive = info[0].As<Napi::String>().Utf16Value();
  if (drive.size() != 2 || drive[1] != u':' ||
      !((drive[0] >= u'A' && drive[0] <= u'Z') || (drive[0] >= u'a' && drive[0] <= u'z'))) {
    return env.Null();
  }
  auto* worker = new QueryDosDeviceWorker(env, std::move(drive));
  Napi::Promise promise = worker->GetPromise();
  worker->Queue();
  return promise;
}

Napi::Value InspectPathEntry(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() != 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "inspectPathEntry(path: string)").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  std::u16string path = info[0].As<Napi::String>().Utf16Value();
  if (
      path.empty() || path.size() > kWindowsPathMaxChars ||
      path.find(u'\0') != std::u16string::npos) {
    Napi::Object result = Napi::Object::New(env);
    result.Set("status", "unavailable");
    return result;
  }
  auto* worker = new InspectPathEntryWorker(env, std::move(path));
  Napi::Promise promise = worker->GetPromise();
  worker->Queue();
  return promise;
}

}  // namespace

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("queryDosDeviceTarget", Napi::Function::New(env, QueryDosDeviceTarget));
  exports.Set("inspectPathEntry", Napi::Function::New(env, InspectPathEntry));
  return exports;
}

NODE_API_MODULE(orca_windows_path_evidence, Init)
