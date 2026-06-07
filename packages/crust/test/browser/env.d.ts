// vitest serves CSS imports through vite at runtime; this declaration keeps
// tsc happy about the side-effect style imports in the browser tests.
declare module '*.css';
