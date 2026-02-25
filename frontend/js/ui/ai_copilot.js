(function () {
    const SYS_PROMPT = `Sos un experto en marketing educativo y community manager. 
Tu objetivo es redactar comunicaciones persuasivas, empáticas y claras para alumnos de talleres educativos. 
Vas a recibir el contexto sociodemográfico del taller. Usa un tono que conecte con la edad promedio.
Nunca agregues saludos robóticos ni asumas un rol de IA. Escribí directamente el texto final listo para enviar.`;

    // Local storage key for protecting the user's API key
    const STORE_KEY = 'tc_ai_copilot_settings';

    function getSettings() {
        try {
            const saved = localStorage.getItem(STORE_KEY);
            return saved ? JSON.parse(saved) : { provider: 'gemini', apiKey: '' };
        } catch {
            return { provider: 'gemini', apiKey: '' };
        }
    }

    function setSettings(provider, apiKey) {
        localStorage.setItem(STORE_KEY, JSON.stringify({ provider, apiKey }));
    }

    async function generateCompletion(promptText) {
        const settings = getSettings();
        if (!settings.apiKey) throw new Error('No has configurado tu API Key');

        if (settings.provider === 'gemini') {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${settings.apiKey}`;
            const payload = {
                contents: [{ parts: [{ text: SYS_PROMPT + "\\n\\n---\\n\\n" + promptText }] }]
            };

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err?.error?.message || 'Error en Gemini API');
            }

            const data = await res.json();
            return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        }

        // Add logic for OpenAI if needed in the future
        throw new Error('Proveedor no soportado actualmente');
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
})();
