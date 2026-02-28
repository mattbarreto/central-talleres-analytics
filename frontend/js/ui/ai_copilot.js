const SYS_PROMPT = `Sos un experto en marketing educativo y community manager. 
Tu objetivo es redactar comunicaciones persuasivas, empáticas y claras para alumnos de talleres educativos. 
Vas a recibir el contexto sociodemográfico del taller. Usa un tono que conecte con la edad promedio.
Nunca agregues saludos robóticos ni asumas un rol de IA. Escribí directamente el texto final listo para enviar.`;

const STORE_PREFIX = 'tc_ai_settings_';
const DEFAULT_SETTINGS = { provider: 'gemini', model: 'gemini-1.5-pro', apiKey: '', endpoint: '' };

function normalizeSettings(rawSettings = {}) {
    const provider = String(rawSettings.provider || DEFAULT_SETTINGS.provider).trim().toLowerCase();
    const allowedProviders = new Set(['gemini', 'openai', 'anthropic', 'openrouter', 'ollama']);
    return {
        provider: allowedProviders.has(provider) ? provider : DEFAULT_SETTINGS.provider,
        model: String(rawSettings.model || DEFAULT_SETTINGS.model),
        apiKey: String(rawSettings.apiKey || ''),
        endpoint: String(rawSettings.endpoint || ''),
    };
}

function getSettings(adminEmail) {
    if (!adminEmail) return { ...DEFAULT_SETTINGS };
    try {
        const saved = localStorage.getItem(STORE_PREFIX + adminEmail);
        return saved ? normalizeSettings(JSON.parse(saved)) : { ...DEFAULT_SETTINGS };
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

function setSettings(adminEmail, provider, model, apiKey, endpoint = '') {
    if (!adminEmail) return;
    localStorage.setItem(STORE_PREFIX + adminEmail, JSON.stringify(normalizeSettings({ provider, model, apiKey, endpoint })));
}

async function generateCompletion(adminEmail, promptText, onChunk = null) {
    const settings = getSettings(adminEmail);
    let fullText = '';

    if (settings.provider === 'gemini') {
        if (!settings.apiKey) throw new Error('No has configurado tu API Key para Gemini');
        const modelToUse = settings.model || 'gemini-1.5-pro';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${settings.apiKey}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: SYS_PROMPT + "\n\n---\n\n" + promptText }] }] })
        });
        if (!res.ok) throw new Error((await res.json())?.error?.message || 'Error en Gemini API');
        fullText = (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text || '';

    } else if (settings.provider === 'openai') {
        if (!settings.apiKey) throw new Error('No has configurado tu API Key para OpenAI');
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
            body: JSON.stringify({
                model: settings.model || 'gpt-4o',
                messages: [{ role: 'system', content: SYS_PROMPT }, { role: 'user', content: promptText }]
            })
        });
        if (!res.ok) throw new Error((await res.json())?.error?.message || 'Error en OpenAI API');
        fullText = (await res.json()).choices?.[0]?.message?.content || '';

    } else if (settings.provider === 'anthropic') {
        if (!settings.apiKey) throw new Error('No has configurado tu API Key para Anthropic');
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': settings.apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true' // Required if calling directly from browser
            },
            body: JSON.stringify({
                model: settings.model || 'claude-3-5-sonnet-20240620',
                max_tokens: 1024,
                system: SYS_PROMPT,
                messages: [{ role: 'user', content: promptText }]
            })
        });
        if (!res.ok) throw new Error((await res.json())?.error?.message || 'Error en Anthropic API');
        fullText = (await res.json()).content?.[0]?.text || '';

    } else if (settings.provider === 'openrouter') {
        if (!settings.apiKey) throw new Error('No has configurado tu API Key para OpenRouter');
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.apiKey}`,
                'HTTP-Referer': window.location.origin,
                'X-Title': 'Central de Talleres'
            },
            body: JSON.stringify({
                model: settings.model || 'openrouter/auto',
                messages: [{ role: 'system', content: SYS_PROMPT }, { role: 'user', content: promptText }]
            })
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload?.error?.message || payload?.message || 'Error en OpenRouter API');
        const content = payload?.choices?.[0]?.message?.content;
        fullText = Array.isArray(content)
            ? content.map((part) => (typeof part === 'string' ? part : part?.text || '')).join('')
            : (content || '');

    } else if (settings.provider === 'ollama') {
        const endpoint = settings.endpoint || 'http://localhost:11434';
        const res = await fetch(`${endpoint.replace(/\/$/, '')}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.model || 'llama3',
                stream: false,
                messages: [{ role: 'system', content: SYS_PROMPT }, { role: 'user', content: promptText }]
            })
        });
        if (!res.ok) throw new Error('Error de conexión con Servidor Ollama. Revisa tu Endpoint/CORS.');
        fullText = (await res.json()).message?.content || '';

    } else {
        throw new Error('Proveedor de IA no soportado actualmente');
    }

    // Simulación de Streaming Vercel Pattern
    if (onChunk) {
        const chunkSize = Math.max(1, Math.floor(fullText.length / 80));
        let currentText = '';
        for (let i = 0; i < fullText.length; i += chunkSize) {
            currentText += fullText.slice(i, i + chunkSize);
            onChunk(currentText);
            await new Promise(r => setTimeout(r, 15));
        }
        if (currentText !== fullText) onChunk(fullText);
    }

    return fullText;
}

function promptBuilder(workshop, enrollmentsCount, meanAge, intention, format) {
    return `
CONTEXTO DEL TALLER:
- Nombre: ${workshop.name}
- Inscriptos actuales: ${enrollmentsCount}
- Edad promedio de los alumnos: ${meanAge > 0 ? meanAge + ' años' : 'Desconocida (tratar como adultos jóvenes)'}

SOLICITUD:
Redactá un texto con intención: '${intention}'
El formato debe ser ideal para: ${format} (ej. si es Instagram usa emojis y hashtags, si es Email usa párrafos más formales pero amables).
`;
}

window.AICopilot = {
    getSettings,
    setSettings,
    generateCompletion,
    promptBuilder
};

export default window.AICopilot;
