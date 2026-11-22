/*
 * Local transcription (faster-whisper, on the CPU): /get -stt. The Python script lives in
 * scripts/transcribe.py and the models in WHISPER_DIR (the default comes in the Docker image).
 */

const { BIN_PYTHON, SCRIPT_TRANSCRIPTION, WHISPER_DIR } = require('./constants');
const { getSetting } = require('./settings');
const { captureOutput } = require('./util/processes');

// More than the download: the model may be downloaded the first time and the CPU is slow
const TRANSCRIPTION_TIMEOUT_MS = 15 * 60 * 1000;

// The script arguments (the model and the language come from the settings)
const transcriptionArgs = (fileAlt) => [
    SCRIPT_TRANSCRIPTION, fileAlt, getSetting('stt.model'), WHISPER_DIR, getSetting('stt.language')
];

// The full command, for -verbose
const transcriptionCommand = (fileAlt) => [BIN_PYTHON, ...transcriptionArgs(fileAlt)].join(' ');

/**
 * Transcribes an audio file with the model from the stt.model setting.
 * @param {string} file
 * @returns {Promise<{ text: string, language: string, duration: number }>}
 */
async function transcribeFile(fileAlt) {
    const outputAlt = await captureOutput(BIN_PYTHON, transcriptionArgs(fileAlt), TRANSCRIPTION_TIMEOUT_MS, { log: true });

    // faster-whisper may write warnings before: the JSON is the last line
    const json = JSON.parse(outputAlt.split('\n').at(-1));
    return { text: json.text, language: json.language, duration: json.duration };
}

module.exports = { transcriptionCommand, transcribeFile };
