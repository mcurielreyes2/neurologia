// chatUI.js

import { initOsmaSession } from './osmaHandler.js';
import { sendMessageStream, abortController } from './streamHandler.js';

/**
 * Initializes the chat UI by appending a welcome message.
 */
export function initChatUI() {
  const chatBox = document.getElementById("chat-box");
  const welcomeMessage = document.createElement("div");
  welcomeMessage.className = "assistant-message";
  welcomeMessage.innerText = "Hola, soy un asistente especializado en Neurología. ¿En qué puedo ayudarte?";
  chatBox.appendChild(welcomeMessage);
  chatBox.scrollTop = chatBox.scrollHeight;
}

/**
 * Appends a user message to the chat box.
 */
export function appendUserMessage(message) {
    console.log("appendUserMessage called with message:", message); // Added log
  // Eliminar el cuadro de cambio de OSMA si existe
  const osmaModeBox = document.querySelector('.osma-mode-switch');
  if (osmaModeBox) {
    console.log("Removing existing OSMA mode switch box."); // Added log
    osmaModeBox.remove();
  }

  const chatBox = document.getElementById("chat-box");
  const userMessage = document.createElement("div");
  userMessage.className = "user-message";
  userMessage.innerText = message;
  chatBox.appendChild(userMessage);
  chatBox.scrollTop = chatBox.scrollHeight;
}

/**
 * Appends an assistant message container to the chat box.
 * Returns the created element.
 */
export function appendAssistantMessage(htmlText = "") {
  console.log("appendAssistantMessage called with htmlText:", htmlText); // Added log
  const chatBox = document.getElementById("chat-box");
  const assistantMessage = document.createElement("div");
  assistantMessage.className = "assistant-message";
  assistantMessage.innerHTML = htmlText;
  chatBox.appendChild(assistantMessage);
  chatBox.scrollTop = chatBox.scrollHeight;
  return assistantMessage;
}

/**
 * Returns a new typing indicator element.
 */
export function createTypingIndicator() {
  const indicator = document.createElement("div");
  indicator.className = "assistant-message";
  indicator.innerHTML =
    '<span class="typing-indicator"></span><span class="typing-indicator"></span><span class="typing-indicator"></span>';
  return indicator;
}

/**
 * A simple typewriter effect that gradually adds text to an element.
 */
export function typeWriterEffect(element, text) {
  let index = 0;
  function type() {
    if (index < text.length) {
      element.innerHTML += text.charAt(index);
      index++;
      setTimeout(type, 50);
    } else {
      if (window.MathJax) {
        window.MathJax.typesetPromise([element]).catch(err => console.error("MathJax typeset error:", err));
      }
    }
  }
  type();
}



/**
 * Borrar último mensaje (usuario + asistente), abort streaming, y notificar backend
 */
export function eraseLastAndStop() {
  // Remove last user message from DOM
  removeLastUserMessage();

  // Remove last assistant message from DOM
  removeLastAssistantMessage();

 // Abort streaming if active
  if (abortController) {
    console.log("Aborting streaming.");
    abortController.abort();
    // Do NOT set abortController to null here; streamHandler.js handles it
  }

  // Call the backend to remove the last conversation pair
  fetch("/erase", { method: "POST" })
    .then(response => response.json())
    .then(data => {
      console.log("Backend says:", data.message);
    })
    .catch(err => {
      console.error("Error calling /erase:", err);
    });
}

window.eraseLastAndStop = eraseLastAndStop;

/**
 * Agrega al final del chat un cuadro para cambiar a "Exploración de datos con OSMA".
 * Se asume que al hacer clic se dispara sendOptionMessage() con el mensaje correspondiente.
 */
export function appendOsmaModeSwitchBox() {
    if (!window.OSMA_ENABLED) {
    console.log("OSMA mode is disabled; appendOsmaModeSwitchBox() will do nothing.");
    return;
  }
  console.log("appendOsmaModeSwitchBox called."); // Added log
  // Elimina cualquier cuadro existente para evitar duplicados.
  const existingBox = document.querySelector('.osma-mode-switch');
  if (existingBox) {
    console.log("Existing OSMA mode switch box found. Removing it."); // Added log
    existingBox.remove();
  }

  const chatBox = document.getElementById("chat-box");
  const osmaBox = document.createElement("div");
  osmaBox.className = "osma-mode-switch";
  osmaBox.innerText = "Importar datos de OSMA";

  // Al hacer clic, se inicia la sesión OSMA.
  osmaBox.addEventListener("click", function() {
    console.log("OSMA mode switch box clicked."); // Added log
    // Llama directamente a la función que inicia la sesión OSMA
    initOsmaSession();
    // Activa el modo OSMA para que desde ese momento se envíen las respuestas a OSMA
    window.isOSMASession = true;
    // Se elimina el cuadro para evitar duplicados
    osmaBox.remove();
  });

  chatBox.appendChild(osmaBox);
  chatBox.scrollTop = chatBox.scrollHeight;
}

/**
 * Appends the main option containers below the last message.
 */
export function appendOptionContainers() {
  const chatBox = document.getElementById("chat-box");

  // Remove existing option containers if they exist
  const existingOptions = chatBox.querySelector('.options-wrapper');
  if (existingOptions) {
    existingOptions.remove();
  }

  // Base HTML for coffee options (always shown)
  let optionsHTML = `
    <div class="options-container coffee-options">
      <div class="option-box">Descripción del proceso de tostado de café</div>
      <div class="option-box">Que es el ROR? Como es su procedimiento de calculo?</div>
      <div class="option-box">Cual es el efecto de la temperatura y el tiempo de tostado en la calidad del cafe?</div>
      <div class="option-box">Cuentame detalles respecto a tus documentos de referencia</div>
    </div>
  `;

  // Conditionally add OSMA option only if OSMA is enabled
  if (window.OSMA_ENABLED) {
    optionsHTML += `
      <div class="options-container osma-option">
        <div class="option-box osma">Exploración de datos con OSMA</div>
      </div>
    `;
  }

  const optionsWrapper = document.createElement('div');
  optionsWrapper.className = 'options-wrapper';
  optionsWrapper.innerHTML = optionsHTML;

  chatBox.appendChild(optionsWrapper);

  // Scroll to bottom if needed
  chatBox.scrollTop = chatBox.scrollHeight;
}

/**
 * Removes the last user message from the chat box.
 */
function removeLastUserMessage() {
  console.log("removeLastUserMessage called."); // Added log
  const chatBox = document.getElementById("chat-box");
  const userMessages = chatBox.querySelectorAll(".user-message");
  if (userMessages.length > 0) {
    userMessages[userMessages.length - 1].remove();
  }
}

/**
 * Removes the last assistant message from the chat box.
 */
function removeLastAssistantMessage() {
  console.log("removeLastAssistantMessage called."); // Added log
  const chatBox = document.getElementById("chat-box");
  const assistantMessages = chatBox.querySelectorAll(".assistant-message");
  if (assistantMessages.length > 0) {
    assistantMessages[assistantMessages.length - 1].remove();
  }
}

/**
 * Hides Top part of the page after first message is sent
 */

export function hideOptionContainers() {
  console.log("hideOptionContainers called.");

  const welcomeMessageEl = document.querySelector(".welcome-message");
  const coffeeOptionsContainerEl = document.querySelector(".options-container.coffee-options");
  const osmaOptionsContainerEl = document.querySelector(".options-container.osma-option");

  // NEW: also hide the .options-wrapper
  const optionsWrapperEl = document.querySelector(".options-wrapper");

  if (welcomeMessageEl) {
    welcomeMessageEl.style.display = "none";
  }
  if (coffeeOptionsContainerEl) {
    coffeeOptionsContainerEl.style.display = "none";
  }
  if (osmaOptionsContainerEl) {
    osmaOptionsContainerEl.style.display = "none";
  }

  // Hide the parent wrapper
  if (optionsWrapperEl) {
    optionsWrapperEl.style.display = "none";
  }

  console.log("Ocultando .welcome-message, .coffee-options, .osma-option, y .options-wrapper.");
}

/**
 * Scrolls the chat-box to the bottom smoothly.
 */
export function scrollToBottom() {
  const chatBox = document.getElementById("chat-box");
  if (chatBox) {
    chatBox.scrollTo({
      top: chatBox.scrollHeight,
      behavior: "smooth" // Use "auto" for instant scroll
    });
  }
}


// /**
//  * Post-process the assistant's final text to:
//  *  1) Find doc references like **SomeDocName.pdf** (enclosed in double asterisks and ending in .pdf).
//  *  2) Assign each doc a numeric citation [1], [2], ...
//  *  3) Append a "References" list with each doc as a link.
//  *
//  * @param {string} fullText - The final text from the assistant (HTML or plain text).
//  * @return {string} The updated text with inline [n] citations + a "References" block.
//  */
// export function postProcessReferences(fullText) {
//   // 1) Regex to match: **SomeDocName.pdf**
//   const docRegex = /\*\*([^*]+\.pdf)\*\*/g;
//
//   // 2) We'll store each unique doc in a Map: docName -> citationNumber
//   const docMap = new Map();
//   let docCounter = 1;
//
//   // 3) Replace in the text: keep the doc name, then add [n]
//   let replacedText = fullText.replace(docRegex, (fullMatch, docName) => {
//     // If we haven't seen this docName, assign a new number
//     if (!docMap.has(docName)) {
//       docMap.set(docName, docCounter);
//       docCounter++;
//     }
//     const citationNum = docMap.get(docName);
//
//     // Return the original (with asterisks) + [n]
//     // e.g. "**FlujoG-3-Neumonia_Aguda.pdf**[1]"
//     return `**${docName}**<span class="doc-citation-number">[${citationNum}]</span>`;
//   });
//
//   // 4) If any references found, append a "References" section at the end
//   if (docMap.size > 0) {
//     replacedText += `<br><br><strong>Referencias:</strong><br>`;
//     for (const [docName, number] of docMap.entries()) {
//       // If you want clickable links, define your doc URL here
//       const docUrl = `/static/docs/${docName}`;
//
//       replacedText += `[${number}] <a href="${docUrl}" target="_blank">${docName}</a><br>`;
//     }
//   }
//
//   return replacedText;
// }