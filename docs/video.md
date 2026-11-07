# Demo video

The footage is recorded by a script from the live site, in real time, then assembled with ffmpeg. Only dead waiting time (block inclusion) is cut; nothing is sped up.

```sh
npx tsx scripts/video/record.ts            # all scenes -> ~/Movies/qrypt-demo/clips/<scene>.mp4 + markers
npx tsx scripts/video/record.ts 5-swap     # re-record one scene
npx tsx scripts/video/assemble.ts          # -> ~/Movies/qrypt-demo/qrypt-demo-silent.mp4 + cues-timing.md
```

- `scripts/video/lib.ts`: a CDP screencast of each page, a visible cursor, smooth moves, and markers for cuts and key moments. Frames keep their real timestamps.
- `scripts/video/record.ts`: the scenes, in order:
  1. the problem;
  2. onboarding;
  3. send through three mempools;
  4. tamper;
  5. Uniswap v4 swap;
  6. extension and dapp sign-in;
  7. phone;
  8. explorer.

  Setup such as accounts and pinning the inspector happens off camera, and scenes retry on devnet drops.
- `scripts/video/assemble.ts` and `cards.ts`:
  - trims at the markers;
  - splices the extension approval windows into the dapp scene;
  - frames the phone and popup;
  - adds the title and closing cards and the fades.

The voiceover is recorded separately (see `~/Movies/qrypt-demo/cues.md`) and mixed in afterwards.
