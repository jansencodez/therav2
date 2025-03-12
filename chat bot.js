// Global Variables and Constants
const sendButton = document.getElementById("send-button");
const userInput = document.getElementById("user-input");
const chatBox = document.getElementById("chat-box");
let isProcessing = false;
let currentStreamingId = null;

// Voice Recognition and Synthesis
let recognition = null;
let isVoiceEnabled = true;
let synth = window.speechSynthesis;
let isRecording = false;
let voices = [];

// Event Listeners
sendButton.addEventListener("click", handleUserMessage);
userInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && !isProcessing) handleUserMessage();
});
document
  .getElementById("mic-button")
  .addEventListener("click", toggleVoiceInput);
document
  .getElementById("voice-toggle")
  .addEventListener("click", toggleVoiceOutput);

// Initialize Speech Recognition
if ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    userInput.value = transcript;
    handleUserMessage();
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
    stopVoiceInput();
  };
} else {
  document.getElementById("mic-button").disabled = true;
  console.warn("Speech recognition not supported");
}

// Initialize Speech Synthesis
if (synth) {
  synth.onvoiceschanged = () => {
    voices = synth.getVoices();
    console.log(
      "Available voices:",
      voices.map((v) => v.name)
    );
  };
  voices = synth.getVoices();
}

// Voice and Speech Functions
function toggleVoiceInput() {
  if (!isRecording) {
    startVoiceInput();
  } else {
    stopVoiceInput();
  }
}

function startVoiceInput() {
  if (recognition) {
    recognition.start();
    isRecording = true;
    document.getElementById("mic-button").classList.add("recording");
  }
}

function stopVoiceInput() {
  if (recognition) {
    recognition.stop();
    isRecording = false;
    document.getElementById("mic-button").classList.remove("recording");
  }
}

function toggleVoiceOutput() {
  isVoiceEnabled = !isVoiceEnabled;
  const voiceButton = document.getElementById("voice-toggle");
  voiceButton.classList.toggle("active", isVoiceEnabled);
  localStorage.setItem("voiceEnabled", isVoiceEnabled.toString());
}

function getPreferredVoice() {
  const femaleVoices = voices.filter(
    (voice) =>
      voice.name.toLowerCase().includes("female") ||
      voice.name.includes("Google UK English Female") ||
      voice.name.includes("Zira") ||
      voice.name.includes("Samantha") ||
      voice.name.includes("Alice") ||
      voice.name.includes("Microsoft Hazel")
  );
  return (
    femaleVoices.find((v) => v.lang === "en-US") ||
    femaleVoices.find((v) => v.lang.startsWith("en")) ||
    femaleVoices[0]
  );
}

function splitIntoSentences(text) {
  const sentenceRegex = /[^.!?]+[.!?]*/g;
  const sentences = text.match(sentenceRegex) || [text];
  return sentences.map((s) => s.trim()).filter((s) => s.length > 0);
}

function speakText(text, onEndCallback) {
  if (isVoiceEnabled && synth && !synth.speaking) {
    const cleanedText = text.replace(/\s+/g, " ").trim();
    const sentences = splitIntoSentences(cleanedText);
    let currentIndex = 0;

    function speakNext() {
      if (currentIndex >= sentences.length) {
        if (onEndCallback) onEndCallback();
        return;
      }
      const sentence = sentences[currentIndex];
      const utterance = new SpeechSynthesisUtterance(sentence);
      utterance.voice =
        getPreferredVoice() ||
        voices.find((v) => v.lang.startsWith("en")) ||
        voices[0];
      utterance.rate = 1.0;
      utterance.pitch = 0.9;
      utterance.volume = 1; // Ensure full volume
      utterance.onend = () => {
        currentIndex++;
        speakNext();
      };
      utterance.onerror = (err) => {
        console.error("Speech error:", err);
        currentIndex++;
        speakNext();
      };
      synth.speak(utterance);
    }
    speakNext();
  } else {
    if (onEndCallback) onEndCallback();
  }
}

// Message Handling Functions
async function handleUserMessage() {
  if (isProcessing) return;
  const message = userInput.value.trim();
  if (!message) return;

  isProcessing = true;
  sendButton.disabled = true;

  displayMessage(message, "user");
  userInput.value = "";

  showTypingIndicator();

  try {
    const response = await fetch("https://thera-ezac.onrender.com/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let botResponse = "";

    const streamingId = Date.now().toString();
    currentStreamingId = streamingId;
    createStreamingMessage(streamingId);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (currentStreamingId !== streamingId) {
        reader.cancel();
        break;
      }
      botResponse += decoder.decode(value, { stream: true });
      updateStreamingMessage(streamingId, botResponse);
    }

    finalizeStreamingMessage(streamingId, botResponse);
  } catch (error) {
    console.error("Error:", error);
    displayMessage(
      "Sorry, I'm having trouble responding. Please try again.",
      "bot"
    );
  } finally {
    hideTypingIndicator();
    isProcessing = false;
    sendButton.disabled = false;
    currentStreamingId = null;
  }
}

function displayMessage(content, sender) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${sender}-message`;

  const timestamp = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const processedContent = sender === "bot" ? linkify(content) : content;

  messageDiv.innerHTML = `
    <div class="message-timestamp">${timestamp}</div>
    <div class="message-content">${processedContent}</div>
  `;

  chatBox.appendChild(messageDiv);
  if (sender === "bot" && isVoiceEnabled) {
    speakText(content, () => {
      setTimeout(() => {
        startVoiceInput();
      }, 1000);
    });
  } else if (sender === "bot") {
    startVoiceInput();
  }
  scrollToBottom();
}

function createStreamingMessage(id) {
  const messageDiv = document.createElement("div");
  messageDiv.className = "message bot-message streaming";
  messageDiv.setAttribute("data-stream-id", id);
  messageDiv.innerHTML = `
    <div class="message-timestamp">
      ${new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}
    </div>
    <div class="message-content" data-stream-content="${id}"></div>
  `;
  chatBox.appendChild(messageDiv);
  scrollToBottom();
}

function updateStreamingMessage(id, content) {
  const contentDiv = document.querySelector(`[data-stream-content="${id}"]`);
  if (contentDiv) contentDiv.textContent = content;
}

function cancelCurrentSpeech() {
  if (synth.speaking) {
    synth.cancel();
  }
}

function finalizeStreamingMessage(id, content) {
  const streamingDiv = document.querySelector(`[data-stream-id="${id}"]`);
  if (streamingDiv) {
    streamingDiv.classList.remove("streaming");
    const processedContent = linkify(content);
    streamingDiv.querySelector(".message-content").innerHTML = processedContent;
    streamingDiv.removeAttribute("data-stream-id");
  }

  if (isVoiceEnabled) {
    cancelCurrentSpeech();
    speakText(content, () => {
      setTimeout(() => {
        startVoiceInput();
      }, 1000);
    });
  } else {
    startVoiceInput();
  }
}

// Utility Functions
function correctUrls(text) {
  return text
    .replace(/(https?):?\/?\/?:?/gi, "$1://")
    .replace(/:\s+/g, ":")
    .replace(/(\.[a-z]{2,})\/([a-z])/gi, "$1/$2");
}

function linkify(text) {
  const correctedText = correctUrls(text);
  const phoneRegex =
    /(\+?\d{1,4}[\s-]?)?(\(\d{1,5}\)[\s-]?)?\d{1,5}[\s-]?\d{1,5}[\s-]?\d{1,9}/g;
  const urlRegex =
    /(?:\b(https?|ftp|file):\/\/[-A-Z0-9+&@#/%?=~_|!:,.;]*[-A-Z0-9+&@#/%=~_|])/gi;

  return correctedText
    .replace(
      urlRegex,
      (url) => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`
    )
    .replace(phoneRegex, (phone) => {
      const cleanPhone = phone.replace(/[^\d+]/g, "");
      return `<a href="tel:${cleanPhone}">${phone}</a>`;
    });
}

function showTypingIndicator() {
  const indicator = document.getElementById("typing-indicator");
  indicator.style.display = "flex";
  scrollToBottom();
}

function hideTypingIndicator() {
  document.getElementById("typing-indicator").style.display = "none";
}

function scrollToBottom() {
  setTimeout(() => {
    chatBox.scrollTop = chatBox.scrollHeight;
  }, 50);
}

// Initialize Voice Preferences
const storedVoicePref = localStorage.getItem("voiceEnabled");
isVoiceEnabled = storedVoicePref ? storedVoicePref === "true" : true;
document
  .getElementById("voice-toggle")
  .classList.toggle("active", isVoiceEnabled);
