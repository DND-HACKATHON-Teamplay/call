import { RawData, WebSocket } from "ws";

interface Session {
  twilioConn?: WebSocket;
  frontendConn?: WebSocket;
  modelConn?: WebSocket;
  streamSid?: string;
  saved_config?: any;
  lastAssistantItem?: string;
  responseStartTimestamp?: number;
  latestMediaTimestamp?: number;
  openAIApiKey?: string;
  webhookUrl?: string;
  conversationData?: any;
  isConversationComplete?: boolean;
  conversationStep?: number;
  conversationHistory?: { is_elderly: boolean; conversation: string }[];
}
const INITIAL_PROMPT = `
당신은 고령자를 위한 따뜻하고 친절한 AI 전화 상담원입니다.

**역할**: 고령 어르신과 자연스러운 전화 상담을 진행하세요.

**대화 목표**: 다음 3가지 주제에 대해 자연스럽게 대화하세요
1. 수면 상태 (어젯밤 잠은 몇시간 정도 주무셨는지)
2. 기분 상태 (오늘 하루 기분이 어떠신지)  
3. 건강 상태 (몸 어디 편찮은 곳은 없는지)

**대화 스타일**:
- 매번 어르신의 답변에 먼저 공감하고 적절히 반응하세요
- 그 다음에 자연스럽게 다음 질문으로 이어가세요
- 건강 문제가 있으면 간단한 조언을 해주세요
- 따뜻하고 친근한 톤으로 대화하세요

**중요**: 사용자의 실제 응답을 정확히 듣고 그 내용에 맞게 반응하세요. 아래 예시는 대화 흐름 참고용이며, 실제 대화에서는 사용자가 말한 구체적인 내용에 맞춰 대화하세요.

**대화 흐름 예시**:
AI: "안녕하세요, 어르신! 오늘 간단한 안부 인사를 드리려고 전화드렸어요."
어르신: [인사 응답 - 예: "네 안녕하세요", "네 그래요", "안녕하세요" 등]
AI: [간단한 응답 확인 후 바로 첫 번째 질문] "어르신 어젯밤 잠은 몇시간 정도 주무셨어요?"
어르신: [수면 시간 응답 - 예: "6시간", "잘 못잤어요", "푹 잤어요" 등]
AI: [수면 응답에 대한 적절한 공감] + "그럼 오늘 하루 기분은 어떠셨어요?"
어르신: [기분 상태 응답 - 예: "좋았어요", "우울해요", "그냥 그래요" 등]  
AI: [기분 응답에 대한 적절한 공감] + "혹시 몸 어디 편찮으신 데는 없으세요?"
어르신: [건강 상태 응답 - 예: "무릎 아파요", "감기 기운", "괜찮아요" 등]
AI: [사용자가 말한 구체적인 건강 상태에 맞는 조언과 공감] + 따뜻한 마무리 인사

**핵심 원칙**: 
- 어르신이 실제로 말씀하신 내용(수면시간, 기분상태, 건강문제)을 정확히 반영해서 대화하세요
- 예시의 구체적인 내용을 그대로 사용하지 말고, 사용자의 실제 답변에 맞춰 반응하세요
- 3가지 주제를 모두 다룬 후 따뜻하게 마무리하세요

지금 첫 번째 인사를 해주세요.
`;
let session: Session = {};

// 최종 응답 JSON을 웹훅 URL로 전송하는 함수
export async function sendToWebhook(data: any) {
  const webhookUrl = session.webhookUrl || process.env.WEBHOOK_URL;
  
  if (!webhookUrl) {
    console.log("No webhook URL configured");
    return;
  }

  // conversationHistory 배열을 content 객체로 감싸기
  const formattedData = {
    content: data
  };

  console.log("🌐 Sending to webhook:", webhookUrl);
  console.log("📦 Webhook data:", JSON.stringify(formattedData, null, 2));

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formattedData),
    });

    if (response.ok) {
      console.log('✅ Successfully sent data to webhook:', webhookUrl);
    } else {
      console.error('❌ Failed to send data to webhook:', response.status, response.statusText);
    }
  } catch (error) {
    console.error('❌ Error sending data to webhook:', error);
  }
}

// 테스트용 웹훅 전송 함수
export async function sendTestWebhook(webhookUrl?: string, testData?: any) {
  const targetUrl = webhookUrl || session.webhookUrl || process.env.WEBHOOK_URL;
  
  if (!targetUrl) {
    console.log("❌ No webhook URL provided for test");
    return { success: false, error: "No webhook URL configured" };
  }

  // 기본 테스트 데이터
  const defaultTestData = [
    {
      "is_elderly": false,
      "conversation": "안녕하세요, 어르신! 오늘 간단한 안부 인사를 드리려고 전화드렸어요."
    },
    {
      "is_elderly": true,
      "conversation": "네 안녕하세요"
    },
    {
      "is_elderly": false,
      "conversation": "어르신 어젯밤 잠은 몇시간 정도 주무셨어요?"
    },
    {
      "is_elderly": true,
      "conversation": "음 7시간정도 잤네요"
    },
    {
      "is_elderly": false,
      "conversation": "아 7시간정도 잘 주무셨군요! 충분히 주무신 것 같아서 다행이네요. 그럼 오늘 하루 기분은 어떠셨어요?"
    },
    {
      "is_elderly": true,
      "conversation": "오늘 기분이 좋았어요"
    },
    {
      "is_elderly": false,
      "conversation": "기분 좋으시다니 정말 다행이에요! 좋은 일이 있으셨나봐요. 그런데 혹시 몸 어디 편찮으신 데는 없으세요?"
    },
    {
      "is_elderly": true,
      "conversation": "무릎이 좀 아파요"
    },
    {
      "is_elderly": false,
      "conversation": "아 무릎이 아프시는군요. 날씨가 추워져서 그럴 수도 있어요. 따뜻하게 찜질해주시고 무리하지 마세요. 네 알겠습니다 내일또 연락드릴게요 좋은하루 보내세요!"
    }
  ];

  const dataToSend = testData || defaultTestData;
  
  // conversationHistory 배열을 content 객체로 감싸기
  const formattedData = {
    content: dataToSend,
    test: true, // 테스트 데이터임을 표시
    timestamp: new Date().toISOString()
  };

  console.log("🧪 Sending TEST webhook to:", targetUrl);
  console.log("📦 Test webhook data:", JSON.stringify(formattedData, null, 2));

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formattedData),
    });

    if (response.ok) {
      console.log('✅ Successfully sent TEST data to webhook:', targetUrl);
      return { success: true, message: "Test webhook sent successfully" };
    } else {
      console.error('❌ Failed to send TEST data to webhook:', response.status, response.statusText);
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }
  } catch (error) {
    console.error('❌ Error sending TEST data to webhook:', error);
    return { success: false, error: (error as Error).message };
  }
}

// AI 응답에서 최종 JSON을 감지하고 추출하는 함수
function extractFinalJson(text: string): any | null {
  console.log("🔍 Trying to extract JSON from text length:", text.length);
  
  try {
    // 더 유연한 JSON 패턴들을 순서대로 시도
    const patterns = [
      // 원래 패턴 (모든 필드 포함)
      /\{[\s\S]*"mindStatus"[\s\S]*"sleepTimes"[\s\S]*"healthStatus"[\s\S]*"summary"[\s\S]*"content"[\s\S]*\}/,
      // mindStatus만 포함된 JSON
      /\{[\s\S]*"mindStatus"[\s\S]*\}/,
      // 아무 JSON이나
      /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/
    ];
    
    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      const match = text.match(pattern);
      
      if (match) {
        console.log(`🎯 Pattern ${i + 1} matched:`, match[0].substring(0, 200) + "...");
        try {
          const jsonStr = match[0];
          const parsed = JSON.parse(jsonStr);
          
          // mindStatus, sleepTimes, healthStatus 중 하나라도 있으면 유효한 JSON으로 간주
          if (parsed.mindStatus || parsed.sleepTimes !== undefined || parsed.healthStatus) {
            console.log("✅ Valid conversation JSON found");
            return parsed;
          } else {
            console.log("❌ JSON found but missing required fields");
          }
        } catch (parseError) {
          console.log(`❌ Pattern ${i + 1} matched but JSON parsing failed:`, parseError);
        }
      }
    }
    
    console.log("❌ No valid JSON pattern found");
    return null;
  } catch (error) {
    console.error('❌ Error in extractFinalJson:', error);
    return null;
  }
}

export function handleCallConnection(ws: WebSocket, openAIApiKey: string, webhookUrl?: string) {
  cleanupConnection(session.twilioConn);
  session.twilioConn = ws;
  session.openAIApiKey = openAIApiKey;
  session.webhookUrl = webhookUrl;
  session.conversationStep = 0; // 대화 시작 전
  
  // conversationHistory 초기화
  session.conversationHistory = [];
  console.log("📞 Call connection established - initialized empty conversationHistory");

  ws.on("message", handleTwilioMessage);
  ws.on("error", ws.close);
  ws.on("close", () => {
    console.log("📞 Twilio WebSocket connection closed");
    console.log("📊 Final conversation history length:", session.conversationHistory?.length || 0);
    
    cleanupConnection(session.modelConn);
    cleanupConnection(session.twilioConn);
    session.twilioConn = undefined;
    session.modelConn = undefined;
    session.streamSid = undefined;
    session.lastAssistantItem = undefined;
    session.responseStartTimestamp = undefined;
    session.latestMediaTimestamp = undefined;
    if (!session.frontendConn) {
      console.log("📞 All connections closed - resetting session");
      session = {};
    }
  });
}

export function handleFrontendConnection(ws: WebSocket) {
  cleanupConnection(session.frontendConn);
  session.frontendConn = ws;

  ws.on("message", handleFrontendMessage);
  ws.on("close", () => {
    cleanupConnection(session.frontendConn);
    session.frontendConn = undefined;
    if (!session.twilioConn && !session.modelConn) session = {};
  });
}

function handleTwilioMessage(data: RawData) {
  const msg = parseMessage(data);
  if (!msg) return;

  // media 이벤트가 아닌 경우만 로그 출력
  if (msg.event !== "media") {
    console.log("📞 Twilio message received:", msg.event);
  }

  switch (msg.event) {
    case "start":
      console.log("📞 Call started, streamSid:", msg.start.streamSid);
      session.streamSid = msg.start.streamSid;
      session.latestMediaTimestamp = 0;
      session.lastAssistantItem = undefined;
      session.responseStartTimestamp = undefined;
      tryConnectModel();
      break;
    case "media":
      session.latestMediaTimestamp = msg.media.timestamp;
      if (isOpen(session.modelConn)) {
        jsonSend(session.modelConn, {
          type: "input_audio_buffer.append",
          audio: msg.media.payload,
        });
      }
      break;
    case "stop":
      console.log("📞 Call ended - Twilio stop event received");
      closeAllConnections();
      break;
    case "close":
      console.log("📞 Call ended - Twilio close event received");
      closeAllConnections();
      break;
  }
}

function handleFrontendMessage(data: RawData) {
  const msg = parseMessage(data);
  if (!msg) return;

  // 웹훅 테스트 요청 처리
  if (msg.type === "webhook.test") {
    console.log("🧪 Webhook test requested from frontend");
    
    sendTestWebhook(msg.webhookUrl, msg.testData)
      .then(result => {
        if (session.frontendConn) {
          jsonSend(session.frontendConn, {
            type: "webhook.test.result",
            success: result.success,
            message: result.message,
            error: result.error
          });
        }
      })
      .catch(error => {
        console.error("❌ Error in webhook test:", error);
        if (session.frontendConn) {
          jsonSend(session.frontendConn, {
            type: "webhook.test.result",
            success: false,
            error: (error as Error).message
          });
        }
      });
    return;
  }

  if (isOpen(session.modelConn)) {
    jsonSend(session.modelConn, msg);
  }

  if (msg.type === "session.update") {
    session.saved_config = msg.session;
  }
}

function tryConnectModel() {
  if (!session.twilioConn || !session.streamSid || !session.openAIApiKey)
    return;
  if (isOpen(session.modelConn)) return;

  console.log("🔗 Connecting to OpenAI model...");

  session.modelConn = new WebSocket(
    "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17",
    {
      headers: {
        Authorization: `Bearer ${session.openAIApiKey}`,
        "OpenAI-Beta": "realtime=v1",
      },
    }
  );

  session.modelConn.on("open", () => {
    console.log("✅ OpenAI WebSocket connected");
    const config = session.saved_config || {};
    const sessionConfig = {
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        turn_detection: { type: "server_vad" },
        voice: "ash",
        input_audio_transcription: { model: "whisper-1" },
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        ...config,
      },
    };
    
    console.log("📝 Sending session config:", JSON.stringify(sessionConfig, null, 2));
    jsonSend(session.modelConn, sessionConfig);
    
    console.log("📝 Sending initial prompt...");
    sendUserMessage(INITIAL_PROMPT); 
  });

  session.modelConn.on("message", (data) => {
    const dataStr = data.toString();
    const messageType = JSON.parse(dataStr).type;
    
    // 로그에서 제외할 메시지 타입들
    const excludedTypes = [
      "response.audio.delta",
      "input_audio_buffer",
      "conversation.item.created",
      "response.created", 
      "response.done",
      "rate_limits.updated",
      "response.output_item.added",
      "response.output_item.done",
      "response.content_part.added",
      "response.audio_transcript.delta",
      "conversation.item.input_audio_transcription.delta"
    ];
    
    const shouldLog = !excludedTypes.some(type => messageType.includes(type));
    
    if (shouldLog) {
      console.log("📨 OpenAI message received:", messageType, dataStr.substring(0, 200) + "...");
    }
    
    handleModelMessage(data);
  });
  
  session.modelConn.on("error", (error) => {
    console.error("❌ OpenAI WebSocket error:", error);
    closeModel();
  });
  
  session.modelConn.on("close", (code, reason) => {
    console.log("🔌 OpenAI WebSocket closed:", code, reason.toString());
    closeModel();
  });
}

function sendUserMessage(text: string) {
 console.log("📤 Sending user message:", text.substring(0, 100) + "...");
 
 if (!isOpen(session.modelConn)) {
   console.error("❌ Model connection not open, cannot send message");
   return;
 }

 /* ① user 메시지 생성  */
 const userMessage = {
   type: "conversation.item.create",
   item: {
     type: "message",
     role: "user",
     content: [
       {
         type: "input_text",  // ← 'text'가 아니라 반드시 'input_text'
         text,
       },
     ],
   },
 };
 
 console.log("📝 Sending conversation item:", JSON.stringify(userMessage, null, 2));
 jsonSend(session.modelConn, userMessage);

 /* ② assistant 응답 트리거  */
 const responseCreate = { type: "response.create" };
 console.log("🎯 Triggering response creation:", JSON.stringify(responseCreate, null, 2));
 jsonSend(session.modelConn, responseCreate);
}

function handleModelMessage(data: RawData) {
  const event = parseMessage(data);
  if (!event) return;

  jsonSend(session.frontendConn, event);

  switch (event.type) {
    case "input_audio_buffer.speech_started":
      handleTruncation();
      break;

    case "response.audio.delta":
      if (session.twilioConn && session.streamSid) {
        if (session.responseStartTimestamp === undefined) {
          session.responseStartTimestamp = session.latestMediaTimestamp || 0;
        }
        if (event.item_id) session.lastAssistantItem = event.item_id;

        jsonSend(session.twilioConn, {
          event: "media",
          streamSid: session.streamSid,
          media: { payload: event.delta },
        });

        jsonSend(session.twilioConn, {
          event: "mark",
          streamSid: session.streamSid,
        });
      }
      break;

    case "response.output_item.done": {
      console.log("🔍 DEBUG: response.output_item.done received");
      const { item } = event;
      console.log("🔍 DEBUG: item type:", item?.type, "role:", item?.role);
      
      if (item.type === "message" && item.role === "assistant") {
        console.log("🔍 DEBUG: Valid assistant message found");
        // AI의 실제 응답을 conversationHistory에 저장
        const content = item.content;
        console.log("🔍 DEBUG: content:", content);
        
        if (content && Array.isArray(content)) {
          console.log("🔍 DEBUG: content is array with length:", content.length);
          for (const contentItem of content) {
            console.log("🔍 DEBUG: contentItem type:", contentItem.type, "has text:", !!contentItem.text, "has transcript:", !!contentItem.transcript);
            
            // text 타입이거나 audio 타입의 transcript가 있는 경우 저장
            let aiResponse = null;
            if (contentItem.type === "text" && contentItem.text) {
              aiResponse = contentItem.text;
            } else if (contentItem.type === "audio" && contentItem.transcript) {
              aiResponse = contentItem.transcript;
            }
            
            if (aiResponse) {
              console.log("🤖 GPT 발화:", aiResponse);
              
              // conversationHistory 초기화 체크
              if (!session.conversationHistory) {
                session.conversationHistory = [];
              }
              
              // AI의 실제 응답을 저장
              session.conversationHistory.push({
                is_elderly: false,
                conversation: aiResponse
              });
              
              console.log(`📊 대화 기록 업데이트 - 총 ${session.conversationHistory.length}개`);
            }
          }
        } else {
          console.log("🔍 DEBUG: content is not array or null");
        }
      } else {
        console.log("🔍 DEBUG: Not a valid assistant message");
      }
      break;
    }

    case "conversation.item.input_audio_transcription.completed":
      // 사용자 음성 인식 완료 시 로깅
      if (event.transcript) {
        console.log("🎤 Audio transcription completed:", event.transcript);
        console.log("👤 사용자 발화:", event.transcript);
        
        // 사용자 응답을 conversationHistory에 저장
        if (!session.conversationHistory) {
          session.conversationHistory = [];
        }
        
        session.conversationHistory.push({
          is_elderly: true,
          conversation: event.transcript
        });
        
        console.log(`💾 사용자 응답 저장 완료 - 총 대화 ${session.conversationHistory.length}개`);
      } else {
        console.log("🔇 Empty transcript received");
      }
      break;
  }
}

function handleTruncation() {
  if (
    !session.lastAssistantItem ||
    session.responseStartTimestamp === undefined
  )
    return;

  const elapsedMs =
    (session.latestMediaTimestamp || 0) - (session.responseStartTimestamp || 0);
  const audio_end_ms = elapsedMs > 0 ? elapsedMs : 0;

  if (isOpen(session.modelConn)) {
    jsonSend(session.modelConn, {
      type: "conversation.item.truncate",
      item_id: session.lastAssistantItem,
      content_index: 0,
      audio_end_ms,
    });
  }

  if (session.twilioConn && session.streamSid) {
    jsonSend(session.twilioConn, {
      event: "clear",
      streamSid: session.streamSid,
    });
  }

  session.lastAssistantItem = undefined;
  session.responseStartTimestamp = undefined;
}

function closeModel() {
  cleanupConnection(session.modelConn);
  session.modelConn = undefined;
  if (!session.twilioConn && !session.frontendConn) session = {};
}

function closeAllConnections() {
  console.log("🔌 Connection closing...");
  console.log("   - conversationHistory length:", session.conversationHistory?.length || 0);
  console.log("   - conversationStep:", session.conversationStep);
  console.log("   - webhookUrl:", session.webhookUrl || process.env.WEBHOOK_URL);
  
  // 통화 종료 시 conversationHistory가 있으면 웹훅 전송
  const sendWebhookPromise = async () => {
    if (session.conversationHistory && session.conversationHistory.length > 0 && (session.webhookUrl || process.env.WEBHOOK_URL)) {
      console.log("📤 Sending conversation history on connection close");
      try {
        await sendToWebhook(session.conversationHistory);
        console.log("✅ Webhook sent successfully before cleanup");
      } catch (error) {
        console.error("❌ Error sending webhook before cleanup:", error);
      }
    } else {
      console.log("❌ Not sending webhook on close:");
      if (!session.conversationHistory || session.conversationHistory.length === 0) {
        console.log("   - No conversation history");
      }
      if (!session.webhookUrl && !process.env.WEBHOOK_URL) {
        console.log("   - No webhook URL");
      }
    }
  };

  // 웹훅 전송을 기다린 후 세션 정리
  sendWebhookPromise().finally(() => {
    if (session.twilioConn) {
      session.twilioConn.close();
      session.twilioConn = undefined;
    }
    if (session.modelConn) {
      session.modelConn.close();
      session.modelConn = undefined;
    }
    if (session.frontendConn) {
      session.frontendConn.close();
      session.frontendConn = undefined;
    }
    session.streamSid = undefined;
    session.lastAssistantItem = undefined;
    session.responseStartTimestamp = undefined;
    session.latestMediaTimestamp = undefined;
    session.saved_config = undefined;
    session.webhookUrl = undefined;
    session.conversationData = undefined;
    session.isConversationComplete = undefined;
    session.conversationStep = undefined;
    session.conversationHistory = undefined;
    
    console.log("🧹 Session cleanup completed");
  });
}

function cleanupConnection(ws?: WebSocket) {
  if (isOpen(ws)) ws.close();
}

function parseMessage(data: RawData): any {
  try {
    return JSON.parse(data.toString());
  } catch {
    return null;
  }
}

function jsonSend(ws: WebSocket | undefined, obj: unknown) {
  if (!isOpen(ws)) {
    return;
  }
  
  const message = JSON.stringify(obj);
  ws.send(message);
}

function isOpen(ws?: WebSocket): ws is WebSocket {
  return !!ws && ws.readyState === WebSocket.OPEN;
}

