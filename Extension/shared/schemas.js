// ── Default State Schema ───────────────────────────────────────────────────

export function createDefaultState() {
  return {
    job: {
      jobId: '',
      jobUrl: '',
      company: '',
      title: '',
    },
    profile: {
      fullName: '',
      firstName: '',
      lastName: '',
      email: '',
      phoneCountryCode: '+91',
      phoneNumber: '',
      resumePath: '',
      answers: {},
      // Job preferences (populated from API on login)
      search_terms: [],
      search_location: 'India',
      experience_level: ['Entry level'],
      on_site: ['On-site', 'Hybrid', 'Remote'],
      date_posted: 'Past month',
      easy_apply_only: true,
      bad_words: [],
      switch_number: 15,
    },

    runtime: {
      currentStep: 'idle',
      progress: 0,
      lastError: '',
      retryCount: 0,
      sessionId: '',
      token: '',
      extensionToken: '',
      userEmail: '',
      isRunning: false,
      isPaused: false,
      totalApplied: 0,
      totalFailed: 0,
      totalSkipped: 0,
      currentSearchTermIndex: 0,
      currentSearchTerm: '',
    },

    naukriRuntime: {
      currentStep: 'idle',
      progress: 0,
      lastError: '',
      retryCount: 0,
      sessionId: '',
      isRunning: false,
      isPaused: false,
      totalApplied: 0,
      totalFailed: 0,
      totalSkipped: 0,
      currentSearchTermIndex: 0,
      currentSearchTerm: '',
    },

    settings: {
      maxApplications: 15,
      humanConfirmSubmit: false,
      delayBetweenApps: 3000,
    },
  };
}

export function createSessionLog(step, status, message, data = {}) {
  return {
    step,
    status,
    message,
    data,
    timestamp: new Date().toISOString(),
  };
}
