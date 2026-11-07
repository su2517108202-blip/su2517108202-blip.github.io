# 散帅 API 接入文档

> OpenAI 兼容的大模型聚合接口：文本、图片、视频、语音统一走一个地址。

## 1. 基本信息

| 项 | 值 |
| --- | --- |
| Base URL | `https://api.ss0100.com/v1` |
| 认证方式 | `Authorization: Bearer sk-你的令牌` |
| 协议 | OpenAI 兼容（Chat Completions / Images / Videos） |
| 计费单位 | 1 额度 = ¥0.01，按实际用量扣费 |
| 模型列表 | `GET /v1/models` |

## 2. 获取令牌

登录控制台 → 左侧「API 密钥」→ 创建令牌 → 选择分组与模型范围。令牌以 `sk-` 开头，**只在创建时展示一次**。

## 3. 快速开始

### curl

```bash
curl https://api.ss0100.com/v1/chat/completions \
  -H "Authorization: Bearer sk-你的令牌" \
  -H "Content-Type: application/json" \
  -d '{"model":"mimo/mimo-v2.6-flash","messages":[{"role":"user","content":"你好"}]}'
```

### Python（官方 OpenAI SDK）

```python
from openai import OpenAI

client = OpenAI(base_url="https://api.ss0100.com/v1", api_key="sk-你的令牌")

resp = client.chat.completions.create(
    model="mimo/mimo-v2.6-flash",
    messages=[{"role": "user", "content": "你好"}],
)
print(resp.choices[0].message.content)
```

### Node.js

```js
import OpenAI from "openai";

const client = new OpenAI({ baseURL: "https://api.ss0100.com/v1", apiKey: "sk-你的令牌" });

const resp = await client.chat.completions.create({
  model: "mimo/mimo-v2.6-flash",
  messages: [{ role: "user", content: "你好" }],
});
console.log(resp.choices[0].message.content);
```

## 4. 模型与价格

模型名统一带厂商前缀（`opencode/`、`mimo/`、`apimart/`、`metaso/`），调用时照写即可。价格随上游调整，**以控制台「模型」页为准**。

### 4.1 文本模型（元 / 百万 tokens）

| 模型 | 输入 | 输出 |
| --- | --- | --- |
| `opencode/kimi-k3` | 32.85 | 164.25 |
| `opencode/grok-4.7` | 21.9 | 65.7 |
| `opencode/qwen3.8-max` | 21.9 | 65.7 |
| `opencode/kimi-k3.1-pro` | 21.9 | 109.5 |
| `opencode/gemini-4-argon` | 21.9 | 109.5 |
| `opencode/glm-5.3` | 15.33 | 48.18 |
| `opencode/hy4-preview` | 9.13 | 27.39 |
| `opencode/hy4` | 9.13 | 27.39 |
| `opencode/mimo-v2.6-pro` | 4.76 | 9.53 |
| `mimo/mimo-v2.6-pro` | 4.5 | 9 |
| `opencode/minimax-m3` | 3.29 | 13.14 |
| `opencode/deepseek-v4.1-flash` | 1.64 | 6.57 |
| `opencode/glm-5.3-flash` | 1.64 | 5.47 |
| `opencode/minimax-m3.1-flash` | 1.64 | 6.57 |
| `opencode/qwen3.8-flash` | 1.64 | 5.15 |
| `opencode/mimo-v2.6-flash` | 1.53 | 3.07 |
| `mimo/mimo-v2.6-flash` | 1.5 | 3 |
| `opencode/muse-spark-1.3-contributor` | 1.09 | 2.19 |
| `opencode/gpt-6-luna` | 1.09 | 5.47 |
| `opencode/claude-haiku-5-5` | 1.09 | 5.47 |

### 4.2 图片模型（元 / 张）

| 模型 | 单价 |
| --- | --- |
| `apimart/wan2.7-image-pro` | 0.596 |
| `apimart/seedream-5-0-pro` | 0.394 |
| `apimart/qwen-image-3.0-pro` | 0.313 |
| `apimart/seedream-5-0-lite` | 0.307 |
| `apimart/seedream-4-5` | 0.285 |
| `apimart/wan2.7-image` | 0.237 |
| `apimart/qwen-image-3.0` | 0.226 |
| `apimart/seedream-5-0-flash` | 0.15 |
| `apimart/gemini-3.1-flash-lite-image` | 0.093 |
| `apimart/gemini-3.1-flash-lite-image-ext` | 0.093 |
| `apimart/gpt-image-2` | 0.093 |
| `apimart/gpt-image-2.6-ext` | 0.093 |
| `apimart/gpt-image-2.6-flare` | 0.093 |
| `apimart/gpt-image-2.6-sunburst` | 0.093 |

### 免费模型

`opencode/iceman-contributor-free`、`opencode/crouton-alpha-free`（上游限时免费）

### 4.3 视频模型

| 模型 | 分辨率 | 单价 |
| --- | --- | --- |
| `metaso/MiniMax-H3` | 768P | ¥0.135 / 秒 |
| `metaso/MiniMax-H3` | 2K | ¥0.225 / 秒 |

### 4.4 语音模型

| 模型 | 用途 | 价格 |
| --- | --- | --- |
| `mimo/mimo-v2.5-tts` | 语音合成（预置音色） | 限时免费 |
| `mimo/mimo-v2.5-tts-voiceclone` | 声音克隆 | 限时免费 |
| `mimo/mimo-v2.5-tts-voicedesign` | 文字设计音色 | 限时免费 |
| `mimo/mimo-v2.5-asr` | 语音识别 | ¥0.75 / 小时 |

## 5. 接口示例

### 5.1 文本（流式）

```python
stream = client.chat.completions.create(
    model="opencode/kimi-k3",
    messages=[{"role": "user", "content": "写一段旁白"}],
    stream=True,
)
for chunk in stream:
    delta = chunk.choices[0].delta.content
    if delta:
        print(delta, end="")
```

### 5.2 图片

```python
img = client.images.generate(
    model="apimart/seedream-4-5",
    prompt="雨夜霓虹街道，电影感光影",
    size="1024x1024",
    n=1,
)
print(img.data[0].url)   # 24 小时内有效，请及时转存
```
> 图片是「请求内轮询」，一次调用约 5–60 秒，客户端超时请设 ≥ 60 秒。

### 5.3 视频

```bash
# 1) 提交任务
curl -X POST https://api.ss0100.com/v1/videos \
  -H "Authorization: Bearer sk-你的令牌" \
  -H "Content-Type: application/json" \
  -d '{"model":"metaso/MiniMax-H3","prompt":"雨夜街道","seconds":5,"resolution":"768P","ratio":"16:9"}'

# 2) 查询进度（完成时 status=completed）
curl https://api.ss0100.com/v1/videos/{task_id} -H "Authorization: Bearer sk-你的令牌"

# 3) 下载视频
curl -L https://api.ss0100.com/v1/videos/{task_id}/content -H "Authorization: Bearer sk-你的令牌" -o out.mp4
```

### 5.4 语音合成（TTS）

TTS 走 Chat Completions，音频在 `choices[0].message.audio.data`：

```python
import base64
resp = client.chat.completions.create(
    model="mimo/mimo-v2.5-tts",
    messages=[{"role": "assistant", "content": "要念的文字"}],
    extra_body={"audio": {"format": "mp3", "voice": "mimo_default"}},
)
audio = base64.b64decode(resp.choices[0].message.audio.data)
open("out.mp3", "wb").write(audio)
```

预置音色：`mimo_default`、`冰糖`、`茉莉`、`苏打`、`白桦`、`Mia`、`Chloe`、`Milo`、`Dean`。

### 5.5 语音识别（ASR）

```python
import base64
b64 = base64.b64encode(open("in.mp3", "rb").read()).decode()
resp = client.chat.completions.create(
    model="mimo/mimo-v2.5-asr",
    messages=[{"role": "user", "content": [
        {"type": "input_audio", "input_audio": {"data": b64, "format": "mp3"}}
    ]}],
)
print(resp.choices[0].message.content)
```

### 5.6 模型列表

```bash
curl https://api.ss0100.com/v1/models -H "Authorization: Bearer sk-你的令牌"
```

## 6. 计费规则

- 计费单位：**1 额度 = ¥0.01**；请求前预扣，完成后按实际用量结算，多退少补。
- 文本按 token 计费（输入、输出分别计价）；图片按张；视频按秒；ASR 按音频时长。
- 余额不足返回 `402`；任务失败一般会退回预扣，最终以「使用日志」为准。
- 控制台「使用日志」可查每一笔的用量与扣费。

## 7. 错误码

| HTTP | 含义 | 处理建议 |
| --- | --- | --- |
| 401 | 令牌无效或已删除 | 检查 `Authorization`，令牌是否被禁用 |
| 402 | 余额不足 | 充值或减少并发 |
| 403 | 无权限 / 模型未授权 | 检查令牌的模型范围 |
| 404 | 模型不存在 | 用 `GET /v1/models` 核对模型名（含前缀） |
| 429 | 触发限流 | 降低并发或退避重试 |
| 500 / 502 | 上游异常 | 重试；持续失败请联系管理员 |

## 8. 注意事项

1. 令牌等同于密码，**不要写进前端代码**，始终放在服务端。
2. 图片链接 24 小时过期，请及时转存到自己的存储。
3. 视频是异步任务：提交 → 轮询 → 下载，不要同步长等。
4. 生成内容需遵守法律法规；违规请求会被拒绝。
