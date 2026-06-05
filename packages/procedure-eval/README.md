# @penelope/procedure-eval

Procedure replay harness for [Penelope](https://github.com/Mushisushi28/penelope).

Given a procedure definition + a recorded conversation thread, replays the procedure against the thread and computes a match score.

## Use cases

- Regression testing: verify a procedure change doesn't break existing conversations.
- Quality benchmarking: score live agent threads against canonical procedure templates.
- Training data generation: record + label conversations for fine-tuning.

## Quick start

```bash
npm install @penelope/procedure-eval
```

```ts
import { createRecorder, replay } from "@penelope/procedure-eval";

// 1. Record a live session
const session = createRecorder(myAgentFn, {
  procedureId: "mobile-detail-v1",
  tenantId: "my-shop",
});

const response = await session.turn("Hey I want a full detail on my Civic");
// ... continue conversation ...
const recording = session.finish("booked");

// 2. Replay against the procedure
const result = await replay(procedure, recording, { passThreshold: 70 });
console.log(result.matchPercent, result.passed);
```

## CLI

```bash
# Replay a procedure JSON against a recording JSON
penelope eval ./procedures/mobile-detail.json ./recordings/rec-001.json
penelope eval ./procedures/mobile-detail.json ./recordings/rec-001.json --threshold 80 --json
```

Exit code: `0` if passed, `1` if failed or error.

## Match scoring

| Weight | Component |
|--------|-----------|
| 50% | Field coverage — how many expected fields were extracted |
| 50% | Turn similarity — Jaccard token overlap between expected and actual agent turns |

In production, replace the Jaccard scorer with an LLM judge call for semantic similarity.

## API

### `replay(procedure, recording, opts?): Promise<EvalResult>`

- `passThreshold` (default 70) — minimum `matchPercent` to set `passed: true`.

### `createRecorder(agentInvokeFn, opts): RecorderSession`

- `.turn(customerMessage, extractedFields?)` — capture one round-trip.
- `.finish(outcome?)` — return the `Recording`.
- `.save()` — persist to `outputDir` as JSON.

### `loadRecording(filePath): Promise<Recording>`

Load a recording from disk.

## License

MIT
