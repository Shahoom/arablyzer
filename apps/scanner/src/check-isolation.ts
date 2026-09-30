import { isolationProblems } from './isolation'

// The check the scanner made as it started, made again in the running container:
//
//   docker compose exec scanner node --import tsx apps/scanner/src/check-isolation.ts
//
// It prints what it found as JSON, and exits 1 when the network is not closed. The post-deploy
// script runs it (infra/verify-deploy.ts).
const problems = await isolationProblems()
console.log(JSON.stringify({ problems }))
process.exitCode = problems.length === 0 ? 0 : 1
