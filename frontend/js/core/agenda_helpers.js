// Módulo de utilitarios para la Agenda Pedagógica V3
// Encapsula la lógica de dominio del cliente para el cálculo de fechas, temas y overlap intra-lote

window.AgendaHelpers = {
    /**
     * Genera cronológicamente un array de fechas filtrado por días de la semana
     * @param {string} startStr - YYYY-MM-DD
     * @param {string} endStr - YYYY-MM-DD
     * @param {number[]} selectedDays - Array de index de días (0=DOM, 1=LUN... 6=SAB)
     * @returns {string[]} Formato YYYY-MM-DD
     */
    generateDates(startStr, endStr, selectedDays) {
        if (!startStr || !endStr) return [];
        const st = new Date(startStr + "T00:00:00");
        const ed = new Date(endStr + "T23:59:59");
        const dates = [];
        let cur = new Date(st);
        while (cur <= ed) {
            if (selectedDays.includes(cur.getDay())) {
                dates.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`);
            }
            cur.setDate(cur.getDate() + 1);
        }
        return dates;
    },

    /**
     * A partir de un string separado por saltos de linea, crea un listado mapeable.
     */
    parseTopics(rawText) {
        if (!rawText) return [];
        return rawText.split('\n')
            .map(t => t.trim())
            .filter(t => t.length > 0);
    },

    /**
     * Valida solapamientos internos sobre un mismo payload simulado.
     * Falla la validación si un facilitador específico tiene 2 sesiones cruzándose
     */
    validateInternalOverlaps(simulatedSessions) {
        for (let i = 0; i < simulatedSessions.length; i++) {
            const a = simulatedSessions[i];
            if (!a.facilitator_id) continue;

            for (let j = i + 1; j < simulatedSessions.length; j++) {
                const b = simulatedSessions[j];
                if (a.date !== b.date || a.facilitator_id !== b.facilitator_id) continue;
                // Overlap math: not (A.end <= B.start or A.start >= B.end)
                if (!(a.end_time <= b.start_time || a.start_time >= b.end_time)) {
                    return `El docente seleccionado se solapa consigo mismo el ${a.date} (${a.start_time} vs ${b.start_time})`;
                }
            }
        }
        return null;
    }
};
