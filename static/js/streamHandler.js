// streamHandler.js
import { appendAssistantMessage, appendOsmaModeSwitchBox,hideOptionContainers } from './chatUI.js';
import { promptAbortProcess } from './osmaHandler.js';
import { insertThumbsFeedbackUI } from './thumbsFeedback.js';


export let abortController = null;

/**
 * Optionally fixes double-escaped math delimiters.
 */
function fixMathDelimiters(text) {
  return text
    .replace(/\\\\\(/g, '\\(')
    .replace(/\\\\\)/g, '\\)')
    .replace(/\\\\\[/g, '\\[')
    .replace(/\\\\\]/g, '\\]');
}



/**
 * Gradually appends pending text to the target element.
 * pendingTextRef is an object: { text: "" }.
 */
function backgroundTyper(element, pendingTextRef, speed = 12) {
  let isTyping = false;
  function typeNextChar() {
    if (pendingTextRef.text.length > 0) {
      const nextChar = pendingTextRef.text.charAt(0);
      pendingTextRef.text = pendingTextRef.text.slice(1);
      element.innerHTML += nextChar;
      setTimeout(typeNextChar, speed);
    } else {
      isTyping = false;
    }
  }
  if (!isTyping) {
    isTyping = true;
    typeNextChar();
  }
}

/**
 * Sends a message to the streaming endpoint (/chat_stream) and processes the streamed response.
 * This function is triggered when the user clicks the send button.
 */
export async function sendMessageStream() {
console.log("sendMessageStream called");

const inputField = document.getElementById("user-input");
const message = inputField.value.trim();


console.log("User input message:", message); // For debugging logs

if (message === "") {
  console.log("Empty message. Aborting send.");
  return;
}

  // Hide welcome + options at first user message
  hideOptionContainers();

  // Display user message
  const chatBox = document.getElementById("chat-box");
  const userMessageDiv = document.createElement("div");
  userMessageDiv.className = "user-message";
  userMessageDiv.innerText = message;
  chatBox.appendChild(userMessageDiv);
  chatBox.scrollTop = chatBox.scrollHeight;

  // **Trigger Abort Prompt Only When Sending a Message in OSMA Session**
  if (window.isOSMASession && window.OSMA_ENABLED) {
    console.log("OSMA mode is active; prompting to abort.");
    promptAbortProcess();
    return;
  }

    // (1) Verificar si el backend va a usar RAG
  let isRag = false;
  try {
    const ragResp = await fetch("/check_rag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });
    const ragData = await ragResp.json();
    isRag = ragData.is_rag;
  } catch (err) {
    console.error("Error checking RAG:", err);
  }

  // (2) Si isRag=true, mostramos un aviso especial, arriba de los typing indicators
  let ragMessageDiv = null;
  if (isRag) {
    ragMessageDiv = document.createElement("div");
    // Usa clases de "assistant-message" más una clase especial de blink
    ragMessageDiv.className = "assistant-message rag-status-blink";
    ragMessageDiv.innerText = "Buscando información en los documentos de referencia...";
    chatBox.appendChild(ragMessageDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  // Show typing indicator
  const typingIndicator = document.createElement("div");
  typingIndicator.className = "assistant-message";
  typingIndicator.innerHTML =
    '<span class="typing-indicator"></span><span class="typing-indicator"></span><span class="typing-indicator"></span>';
  chatBox.appendChild(typingIndicator);
  chatBox.scrollTop = chatBox.scrollHeight;

  // IMPORTANT: Use an AbortController if you want to stop streaming
  abortController = new AbortController();
  try {
    const response = await fetch("/chat_stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message }),
      signal: abortController.signal, // pass signal here
    });

    // Remove typing indicator
    chatBox.removeChild(typingIndicator);

    // Quitar el ragMessageDiv (si existe) cuando ya empieza la respuesta
    if (ragMessageDiv && ragMessageDiv.parentNode) {
      ragMessageDiv.parentNode.removeChild(ragMessageDiv);
    }

    // Prepare assistant message container
    const assistantMessageDiv = document.createElement("div");
    assistantMessageDiv.className = "assistant-message";
    chatBox.appendChild(assistantMessageDiv);


    // Check response OK
    if (!response.ok) {
      const errorData = await response.json();
      assistantMessageDiv.innerText = `Error: ${errorData.message}`;
      return;
    }

    // We'll type out the streamed text chunk by chunk
    let pendingText = "";
    let finalRefChunk = null
    let isTyping = false;

    function backgroundTyper(element, speed = 12) {
      if (isTyping) return; // If already typing, do nothing
      isTyping = true;

      function typeNextChar() {
        if (pendingText.length > 0) {
          const nextChar = pendingText.charAt(0);
          pendingText = pendingText.slice(1);
          element.innerHTML += nextChar;
          setTimeout(typeNextChar, speed);
        } else {
          // Done typing for now
          isTyping = false;
        }
      }
      typeNextChar();
    }

    // Start reading streaming chunks
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");

    console.log("A punto de iniciar lectura de stream");
async function readChunk() {
  const { done, value } = await reader.read();
  if (done) {
    console.log("readChunk -> done=true. No más chunks.");
    // El servidor cerró el stream => No llegarán más chunks.

    let checkInterval = setInterval(() => {
      // Esperar a que el typewriter termine (pendingText.length === 0 && !isTyping)
      if (pendingText.length === 0 && !isTyping) {
        clearInterval(checkInterval);

         console.log("DONE: No hay texto pendiente y no está escribiendo. Procesamos markdown.");

        // ******************************
        // Aquí hacemos la conversión a HTML con marked
        // ******************************

        // 1) Determinar qué texto final mostraremos
        let finalContent = "";
        if (finalRefChunk) {
          console.log("Tenemos finalRefChunk. Usamos eso como texto final.");
          // Si llegó un texto especial postprocesado con [REF_POSTPROCESS]
          finalContent = finalRefChunk;
        } else {
          // Si no llegó nada especial, usamos el texto ya tipeado
          // Ojo: para recogerlo tal cual, podemos usar .innerText o .textContent
          console.log("No hay finalRefChunk. Tomamos assistantMessageDiv.innerText como finalContent.");
          finalContent = assistantMessageDiv.innerText;
        }

        // 2) Convertimos el texto final a HTML con marked
        //    (Asegúrate de importar { marked } y/o usar window.marked si CDN)
        console.log("Texto final antes de marked:", finalContent);
        const finalHTML = window.marked.parse(finalContent);
        console.log("HTML resultante de marked:", finalHTML);

        // 3) Reemplazamos el contenido en el DIV con el HTML resultante
        //    Esto mostrará correctamente la tabla Markdown, etc.
        assistantMessageDiv.innerHTML = finalHTML;

        // 4) MathJax (si lo usas) y otros pasos finales
        if (window.MathJax) {
          window.MathJax.typesetPromise([assistantMessageDiv])
            .then(() => {
              // Insertar UI de Thumbs, OSMA, etc. (si corresponde)
              insertThumbsFeedbackUI({ question: message, assistantDiv: assistantMessageDiv });
              appendOsmaModeSwitchBox();
            })
            .catch(err => console.error("MathJax typeset error:", err));
        } else {
          insertThumbsFeedbackUI({ question: message, assistantDiv: assistantMessageDiv });
          appendOsmaModeSwitchBox();
        }

      }
    }, 50);

    return;
  }




  // (si no está done, seguimos procesando el chunk normalmente)
  let chunkText = decoder.decode(value, { stream: true });
    console.log("Chunk recibido:", chunkText);
  if (chunkText.includes("[REF_POSTPROCESS]")) {
    const parts = chunkText.split("[REF_POSTPROCESS]");
    const normalText = parts[0] || "";
    const finalText = parts[1] || "";

    if (normalText) {
      pendingText += normalText;
      backgroundTyper(assistantMessageDiv, 12);
    }
    finalRefChunk = finalText; // se usará al final
  } else {
    pendingText += chunkText;
    backgroundTyper(assistantMessageDiv, 12);
  }
  chatBox.scrollTop = chatBox.scrollHeight;
  readChunk();
}
readChunk();

  } catch (err) {
    // 8) Manejo de errores
    if (typingIndicator.parentNode) {
      typingIndicator.parentNode.removeChild(typingIndicator);
    }
    if (ragMessageDiv && ragMessageDiv.parentNode) {
      ragMessageDiv.parentNode.removeChild(ragMessageDiv);
    }
    const errorMessageDiv = document.createElement("div");
    errorMessageDiv.className = "assistant-message";
    errorMessageDiv.innerText = `Error: ${err}`;
    chatBox.appendChild(errorMessageDiv);
  }
}


/**
 * Similar to sendMessageStream, but triggers when an option-box is clicked.
 */
export async function sendOptionMessage(message) {
  console.log("sendOptionMessage called with message:", message);
  // 1. Oculta todos los contenedores de opciones
  hideOptionContainers();

  // 2) Mostrar el mensaje del usuario en el chat
  const chatBox = document.getElementById("chat-box");
  const userMessageDiv = document.createElement("div");
  userMessageDiv.className = "user-message";
  userMessageDiv.innerText = message;
  chatBox.appendChild(userMessageDiv);
  chatBox.scrollTop = chatBox.scrollHeight;

  // **Trigger Abort Prompt Only When Sending a Message in OSMA Session**
  if (window.isOSMASession && window.OSMA_ENABLED) {
    console.log("OSMA mode is active; prompting to abort.");
    promptAbortProcess();
    return;
  }


  // 3) Verificar si el backend usará RAG (check_rag)
  let isRag = false;
  try {
    const ragResp = await fetch("/check_rag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });
    const ragData = await ragResp.json();
    isRag = ragData.is_rag;  // true o false
  } catch (err) {
    console.error("Error checking RAG:", err);
  }

  // 4) Si RAG es True, mostrar un aviso especial antes de los typing indicators
  let ragMessageDiv = null;
  if (isRag) {
    ragMessageDiv = document.createElement("div");
    // Usa la clase de burbuja del asistente y una clase blink si quieres animar
    ragMessageDiv.className = "assistant-message rag-status-blink";
    ragMessageDiv.innerText = "Buscando información en los documentos de referencia...";
    chatBox.appendChild(ragMessageDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  // 5) Mostrar indicador de escritura
  const typingIndicator = document.createElement("div");
  typingIndicator.className = "assistant-message";
  typingIndicator.innerHTML = `<span class="typing-indicator"></span> <span class="typing-indicator"></span><span class="typing-indicator"></span>`;
  chatBox.appendChild(typingIndicator);
  chatBox.scrollTop = chatBox.scrollHeight;

  // 6) Llamar al endpoint /chat_stream para obtener la respuesta en streaming
  try {
    const response = await fetch("/chat_stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });

    // Quitar el indicador de escritura (si aún está en el DOM)
    if (typingIndicator.parentNode) {
      typingIndicator.parentNode.removeChild(typingIndicator);
    }
    // Quitar el mensaje RAG si existe
    if (ragMessageDiv && ragMessageDiv.parentNode) {
      ragMessageDiv.parentNode.removeChild(ragMessageDiv);
    }

    // Crear contenedor para la respuesta del asistente
    const assistantMessageDiv = document.createElement("div");
    assistantMessageDiv.className = "assistant-message";
    chatBox.appendChild(assistantMessageDiv);

    // Si la respuesta no es OK, mostrar el error
    if (!response.ok) {
      const errorData = await response.json();
      assistantMessageDiv.innerText = `Error: ${errorData.message}`;
      return;
    }

    // 7) Procesar el streaming de la respuesta
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let pendingText = "";
    let finalRefChunk = null
    let isTyping = false;

    function backgroundTyper(element, speed = 12) {
      if (isTyping) return;
      isTyping = true;

      function typeNextChar() {
        if (pendingText.length > 0) {
          const nextChar = pendingText.charAt(0);
          pendingText = pendingText.slice(1);
          element.innerHTML += nextChar;
          setTimeout(typeNextChar, speed);
        } else {
          isTyping = false;
        }
      }
      typeNextChar();
    }


async function readChunk() {
  const { done, value } = await reader.read();
  if (done) {
    // El servidor cerró el stream => No llegarán más chunks.

    let checkInterval = setInterval(() => {
      // Esperar a que el typewriter termine (pendingText.length === 0 && !isTyping)
      if (pendingText.length === 0 && !isTyping) {
        clearInterval(checkInterval);

        // ******************************
        // Aquí hacemos la conversión a HTML con marked
        // ******************************

        // 1) Determinar qué texto final mostraremos
        let finalContent = "";
        if (finalRefChunk) {
          // Si llegó un texto especial postprocesado con [REF_POSTPROCESS]
          finalContent = finalRefChunk;
        } else {
          // Si no llegó nada especial, usamos el texto ya tipeado
          // Ojo: para recogerlo tal cual, podemos usar .innerText o .textContent
          finalContent = assistantMessageDiv.innerText;
        }

        // 2) Convertimos el texto final a HTML con marked
        //    (Asegúrate de importar { marked } y/o usar window.marked si CDN)
        const finalHTML = marked.parse(finalContent);

        // 3) Reemplazamos el contenido en el DIV con el HTML resultante
        //    Esto mostrará correctamente la tabla Markdown, etc.
        assistantMessageDiv.innerHTML = finalHTML;

        // 4) MathJax (si lo usas) y otros pasos finales
        if (window.MathJax) {
          window.MathJax.typesetPromise([assistantMessageDiv])
            .then(() => {
              // Insertar UI de Thumbs, OSMA, etc. (si corresponde)
              insertThumbsFeedbackUI({ question: message, assistantDiv: assistantMessageDiv });
              appendOsmaModeSwitchBox();
            })
            .catch(err => console.error("MathJax typeset error:", err));
        } else {
          insertThumbsFeedbackUI({ question: message, assistantDiv: assistantMessageDiv });
          appendOsmaModeSwitchBox();
        }

      }
    }, 50);

    return;
  }

  // (si no está done, seguimos procesando el chunk normalmente)
  let chunkText = decoder.decode(value, { stream: true });
  if (chunkText.includes("[REF_POSTPROCESS]")) {
    const parts = chunkText.split("[REF_POSTPROCESS]");
    const normalText = parts[0] || "";
    const finalText = parts[1] || "";

    if (normalText) {
      pendingText += normalText;
      backgroundTyper(assistantMessageDiv, 12);
    }
    finalRefChunk = finalText; // se usará al final
  } else {
    pendingText += chunkText;
    backgroundTyper(assistantMessageDiv, 12);
  }
  chatBox.scrollTop = chatBox.scrollHeight;
  readChunk();
}
readChunk();

  } catch (err) {
    // 8) Manejo de errores
    if (typingIndicator.parentNode) {
      typingIndicator.parentNode.removeChild(typingIndicator);
    }
    if (ragMessageDiv && ragMessageDiv.parentNode) {
      ragMessageDiv.parentNode.removeChild(ragMessageDiv);
    }
    const errorMessageDiv = document.createElement("div");
    errorMessageDiv.className = "assistant-message";
    errorMessageDiv.innerText = `Error: ${err}`;
    chatBox.appendChild(errorMessageDiv);
  }
}