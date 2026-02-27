// @ts-check

export const state = {
    workshops: [],
    participants: [],
    communications: [],
    communicationSummary: new Map(),
    workshopSearch: '',
    enrollmentWorkshop: '',
    participantSearch: '',
    participantEnrollmentStatus: 'all',
    participantPopulation: 'all',
    participantMode: 'summary',
    participantActiveDays: '',
    participantHasLoaded: false,
    participantProfiles: [],
    activeParticipantProfile: null,
    communicationSearch: '',
    communicationWorkshop: '',
    teamSearch: '',
    teamRole: 'all',
    teamYear: '',
    teamWorkshopStatus: 'all',
    teamMode: 'summary',
    teamHasLoaded: false,
    teamProfiles: [],
    teamOverview: null,
    adminSearch: '',
    dashboardYear: '',
    dashboardStatus: '',
    dashboardWorkshop: '',
    dashboardMode: 'summary',
    dashboardAdvancedTab: 'status',
    insightsPeriod: 'monthly',
    insightsWorkshop: '',
    insightsStartDate: '',
    insightsEndDate: '',
    insightsMode: 'summary',
    insightsReportPeriod: 'monthly',
    insightsJourneyParticipant: '',
    insightsJourneyQuery: '',
    insightsData: null,
    workshopsDensity: 'regular',
    tablePages: {
        workshops: 1,
        enrollments: 1,
        communications: 1,
        team: 1,
        admins: 1,
    },
    kpiSnapshots: {},
};

export function resetTablePage(key) {
    state.tablePages[key] = 1;
}

export function formatKpiDelta(current, previous) {
    const cur = Number(current) || 0;
    const prev = Number(previous) || 0;
    if (prev === 0) return cur > 0 ? '+100%' : '0%';
    const pct = ((cur - prev) / prev) * 100;
    const rounded = Math.round(pct * 10) / 10;
    if (rounded === 0) return '0%';
    return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

export function buildKpiDeltas(scopeKey, currentMetrics) {
    const current = currentMetrics || {};
    const previous = state.kpiSnapshots[scopeKey] || {};
    const deltas = {};
    Object.keys(current).forEach((key) => {
        deltas[key] = formatKpiDelta(current[key], previous[key]);
    });
    state.kpiSnapshots[scopeKey] = { ...current };
    return deltas;
}
