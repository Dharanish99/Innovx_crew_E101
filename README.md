# Agentic UX Assistant

An intelligent Chrome Extension that acts as an "Agentic UX Navigator," bridging the gap between browser DOM and Large Language Models (LLMs) to provide a conversational interface for web navigation.

## Features

-   **Semantic DOM Scanning**: Intelligently scans the page to extract meaningful interactive elements (buttons, links, inputs), stripping away noise to optimize token usage.
-   **LLM-Powered Navigation**: Utilizes Groq Cloud API (powered by models like Llama 3 or GPT-OSS-120b) to understand user intent and map it to specific on-screen elements.
-   **Natural Language Control**: Users can simply type commands like "Find the login button" or "Search for history," and the agent identifies the correct element.
-   **Safety First**: Includes a middleware safety layer that prevents interaction with sensitive fields (passwords, credit card inputs) and warns the user.
-   **Visual Feedback**: Highlights target elements on the page and provides a "Thinking..." state for better UX.

## Installation

1.  Clone this repository.
2.  Open Chrome and navigate to `chrome://extensions`.
3.  Enable **Developer mode** in the top right.
4.  Click **Load unpacked** and select the directory containing this repository.
5.  The "AI Web Guide" extension should now be active.

## Configuration

The extension requires a Groq API Key to function.
1.  Open `content.js`.
2.  Replace the placeholder or existing key in the `GROQ_API_KEY` constant with your valid Groq API Key.

## Usage

1.  Navigate to any webpage.
2.  The Agentic Assistant UI will appear in the bottom right.
3.  Type a command (e.g., "Go to the home page") and press Enter.
4.  The agent will analyze the page and highlight the relevant element.

## Technologies

-   **Frontend**: Vanilla JavaScript, HTML, CSS (Manifest V3).
-   **AI/LLM**: Groq Cloud API.
