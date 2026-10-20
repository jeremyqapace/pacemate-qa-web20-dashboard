/*
 * Dashboard settings.
 *
 * This is the only file most changes need. Edit a value, commit, push.
 * Vercel redeploys in about 30 seconds. Anything you delete here falls back
 * to the default shown in the comment.
 */
window.DASHBOARD_CONFIG = {
    // Pass rate (percent) needed for "Ready to deploy". Also draws the dashed line on charts.
    releaseThreshold: 80,

    // Command the Rerun buttons copy. Each test's name is added as --name "...".
    rerunCommand: 'npx cucumber-js --profile web20',

    // "Good afternoon, team"
    greetingName: 'team',

    // How many runs the Graphs page shows by default: 10, 30, or 0 for all.
    defaultRange: 10,

    // Warn when the newest run is older than this many hours.
    staleAfterHours: 24,

    // Test types left out of this dashboard (matches the "type" field in results.json).
    excludeTypes: ['API'],

    // Suite name shown in Environment and Run details. CI labels the run "Smoke + API",
    // which reads wrong on a UI-only report. Leave empty ('') to show what results.json says.
    suiteLabel: 'Smoke',

    // How many suites to list before showing "All suites" (sidebar and Overview).
    maxSuitesListed: 10,

    // Folder the page reads results.json, runs.json and coverage-results.json from.
    // CI writes to data/. Open the page with ?data=samples to preview with sample data instead.
    dataFolder: './data'
};
