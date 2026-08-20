# Versioned benchmark scenarios and F3 evidence

Scenario definitions lock the viewport, DPR, font fingerprint, layout, columns,
expansion state, user action, sample count, and acceptance thresholds in addition
to the underlying data fixture.

The F3-10K-EDIT scenario is exported by @bom-editor/benchmark-fixtures. Demo,
browser correctness, and performance runners must import that same definition and
record its scenario fingerprint in every report.

The deterministic headless precheck runs with:

```sh
pnpm --filter @bom-editor/benchmark-scenarios test
```

It uses the normative five warmups and thirty measured samples, then prints
P50/P95/max/mean JSON for editor creation and one field commit. Its thresholds
only reject catastrophic second-scale regressions across development machines.
They do not replace the locked production-browser runner or the whitepaper's
interactive-ready and input-presentation SLOs.

## Browser evidence modes

Run the production-build browser modes from the workspace root:

```sh
pnpm test:e2e:f3
pnpm benchmark:f3:browser
```

`test:e2e:f3` is a fast headless smoke with 1 warmup and 3 measured samples.
It can reject functional, correctness, lifecycle, or gross performance failures,
but it is never release-qualifying. `benchmark:f3:browser` launches headed system
Chrome with 5 warmups and 30 measured samples. It reports unrounded raw values,
nearest-rank P50/P95, max, and population standard deviation. P99 remains
`N/A: insufficient samples` because startup requires at least 200 samples and
continuous interaction requires at least 1000 events.

Cold timing starts immediately before `createBomEditor()` and ends only after
the initial Canvas and semantic DOM are synchronized and the editor is
interactive. Fixture generation occurs before the measured interval. The input
metric currently ends at an ARIA mutation after Canvas draw and is explicitly a
render-commit candidate, not certified compositor presentation latency. Raw and
summary evidence split that interval into input-task queueing, capture-listener
to transaction commit, and the following scheduled Canvas/ARIA synchronization,
so browser scheduling and component work remain separately diagnosable.

Each run writes a self-contained directory under
`benchmarks/reports/f3/<run-id>/`:

```text
report.json
manifest.json
raw/cold-mount.jsonl
raw/input-feedback.jsonl
raw/lifecycle.json
raw/disposable-realm-memory.json
raw/continuous-scroll.json
raw/application-pixel-frame-correlation.json
screenshots/desktop.png
screenshots/mobile.png
screenshots/acceptance-desktop.png
traces/chromium-compositor.json.gz
traces/chromium-compositor-presented-frame-evidence.json
```

The report embeds exact Playwright/Chrome and observed machine data, build and
fixture hashes, sampling conditions, statistics, correctness checks, and
qualification blockers. `manifest.json` hashes the complete artifact set. A
partial trace may be written instead if the run aborts during capture. The
continuous-scroll file is the raw application-pixel evidence. The independent
application-pixel correlation and presented-frame evidence files are written
only when the pinned extractor certifies a complete marked scroll window.

Browser evidence v3 invokes
`bom-f3-chromium-compositor-presented-frame/v1`. Its Chrome 151 profile pins the
exact browser and trace revisions, `WIN_QPC`, 60Hz begin-frame cadence, trace
integrity counters, and event shapes. It uses deduplicated
`Display::FrameDisplayed` timestamps, never RAF, and pairs
`PipelineReporter` records in original-order LIFO semantics. Missing markers,
schema drift, loss counters, refresh mismatch, incomplete 30-second coverage,
or unmatched reporters produce structured failed extraction evidence rather
than zero-valued frame metrics.

## Qualification boundary

The isolated acceptance server sends COOP `same-origin`, COEP `require-corp`,
and CORP `same-origin`. The 1/3/5-instance lifecycle scenarios use
`performance.measureUserAgentSpecificMemory()` as the primary metric when
available, exercise unmount/remount for one instance and edit isolation for
three, then destroy all instances. CDP garbage collection is measurement
support only; CDP heap/DOM values do not replace UA memory.

Chrome 150 evidence showed that a shared Document can retain Canvas allocator
capacity after the editor registry and all observable DOM, Canvas, and Portal
counts reach zero. The runner therefore performs a matched instance-count
create/destroy warmup before each 1/3/5 baseline, but this only reduces first-use
allocator bias. Formal uses the same 30-second quiet, two-CDP-GC, five-second
post-GC schedule for warmup and measured destroy; smoke records its shortened
100ms/two-GC/100ms schedule.

The report preserves total and per-type same-Document UA-memory deltas under
`memoryAssessment.diagnostic`. They are explicitly not component ownership or
leak attribution. `normativeRetention.retainedBytes` and `withinLimit` remain
`null`, `canvasAllocator.baselineCalibrated` remains `false`, and observable
resource-release counts are reported as a separate lifecycle signal. A matched
warmup is not the whitepaper's 10-sample idle-noise calibration and cannot
produce a normative pass.

Browser evidence v3 additionally runs a versioned
`bom-disposable-realm-memory/v1` protocol in visible same-origin, disposable
iframes fixed to 1920x1080 and DPR 2. For each of 1, 3, and 5 instances it runs
a count-matched warmup Realm, a zero-instance control Realm, and a measurement
Realm. Before removing an iframe, acceptance retains direct DOM references and
requires all 11 whitepaper resource assertions to be supported and zero:
DOM, Canvas, Portal, Worker and Worker tasks, DOM/EventHub listeners, three
Observer kinds, RAF, timeout, and interval. Editor queued/running tasks and all
cleanup failures are separate release blockers.

Only an in-place passing `destroy()` may authorize evidence release. The parent
coordinator must then clear its persistent references, detach the iframe, and
show the unique child URL in ready UA-memory attribution but not in the
after-removal sample. A blocked Realm is removed only through the non-evidence
`discard` path; its later memory drop cannot become retention evidence. The
complete raw package is stored in `raw/disposable-realm-memory.json` and
validated by
`schema/disposable-realm-memory-evidence-v1.schema.json`; the main report uses
`schema/f3-evidence-v3.schema.json`.

Formal mode collects at least 10 idle UA-memory samples and applies exactly
30 seconds quiet, two CDP GC cycles, and 5 seconds post-GC to every sample.
Adjacent absolute deltas use nearest-rank P95 as the noise threshold; changes
at or below it become zero. Smoke deliberately uses only 3 idle samples and
100ms/two-GC/100ms timing, so it can verify attribution and release mechanics
but always remains retention-unqualified.

Smoke UA-memory calls use a separate 2-second diagnostic timeout so an
unsupported or stalled browser API cannot turn a short smoke run into a
multi-minute wait. Formal calls retain the 30-second timeout required by the
measurement protocol; a timeout is still recorded as unsupported evidence.
The Realm runner also enforces a 60-second bound on each browser/CDP operation
and a 30-minute formal (3-minute smoke) protocol budget. A formal sample that
returns unsupported UA-memory evidence stops immediately because the required
10-sample qualification is already impossible; smoke continues to collect
diagnostics. The formal same-Document lifecycle gate applies the same early
stop to avoid queueing further acceptance calls behind a stalled renderer. A
bound violation or early unsupported result aborts the protocol fail-closed and
records the exact phase plus completed sample/scenario progress in the browser
report.

The acceptance API now runs one fixed 30,000ms vertical linear triangle from
the minimum scroll offset to the maximum and back. It emits the unique
`bom:f3:scroll:f3-10k-scroll-30s:start/end` marker pair and records a frame
commit only after Canvas, semantic DOM, and Portal synchronization. The raw
assessor validates the trajectory, timing gaps, revision and scroll-offset
consistency, surface coverage, readback success, alpha coverage, and pixel
checksums. Compositor presentation and application pixels remain independently
measured; only a qualified correlation with the certified presented-frame
evidence may supply a non-null application blank-frame count.

The latest completed smoke, `20260720T133148312Z-smoke-133decad`, recorded an
exact 30,000ms marker window. Its raw assessor was valid and
`applicationPixelEvidenceQualified` was `true`: 302 scroll states, 302 paint
states, 301 paints inside the window, and zero readback failures. Cold
interactive-ready and input render-commit candidate P95 values were 198.75ms
and 27.865ms respectively. The Chrome trace was captured, but the extractor
rejected its observed 31,250us begin-frame cadence against the locked 16,667us
cadence with `BOM_F3_TRACE_REFRESH_CADENCE_MISMATCH`. The trace is therefore
not certified; no application-pixel correlation or blank-frame count was
produced. This smoke remains diagnostic and unqualified, not an F3 or release
pass.

The 2026-08-05 smoke archive, `20260805T005047386Z-smoke-222acd7c`, passed the
ordinary Demo functional gate while the repository was still locked to Chrome
150. It therefore records the expected `BOM_F3_TRACE_BROWSER_BUILD_UNSUPPORTED`
drift for the observed Chrome `151.0.7922.71` and remains historical diagnostic
evidence.

On 2026-08-05 the lock was reapproved for the observed Chrome 151 executable,
revision, and GPU device set, and `chromium-151-display-frame/v1` was registered
for the observed event schema. The latest headed formal archive,
`20260805T175001255Z-formal-8ba027e3`, completed the full scroll and disposable
Realm package: all 10 idle samples and all 1/3/5 Realm lifecycles passed the
diagnostic checks, and application-pixel evidence was captured. It remains
unqualified because the compositor extractor reported `BOM_F3_TRACE_DATA_LOSS`
and the zero-instance control delta (54,215 bytes) exceeded that run's calibrated
idle-noise threshold (46,284 bytes).

The whitepaper's normative environment approval is the singular path
`benchmark/environment.json`; the plural `benchmarks/reports/**` tree contains
run artifacts. The checked-in environment is approved for the formal runner.
F3 therefore remains unqualified:
it still requires a certified complete scroll-window extraction, a control-Realm
retention result within the calibrated noise threshold, manual WCAG 2.2
AA/screen-reader evidence, and the two-hour soak package. The formal package is
now archived but remains unqualified on the control-noise gate; smoke supplies
none of the formal Realm retention, manual accessibility, or two-hour soak exit
evidence. Browser evidence v3 therefore constrains `overall` to `unqualified` or `failed`, keeps
`releaseQualified: false` and `f3Pass: false`, and allows only the independent
`destroyRetentionQualified` field to reflect a complete formal Realm result.

Formal mode now performs this approval check immediately after environment
collection. A mismatch returns non-zero and writes the exact lock differences
without starting cold-mount, scroll, or Realm sampling. Smoke mode keeps running
the diagnostic path so functional and candidate performance regressions remain
observable without changing qualification semantics.
