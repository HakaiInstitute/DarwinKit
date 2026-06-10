import { assert, assertEquals, assertThrows } from '@std/assert';
import { makeOutput, writeAll } from './output.ts';

Deno.test('makeOutput routes lines through the provided sink', () => {
  const writes: string[] = [];
  const out = makeOutput((text) => writes.push(text));

  out.line('hello');
  out.blank();

  assertEquals(writes, ['hello\n', '\n']);
});

Deno.test('makeOutput.section wraps the title with surrounding newlines', () => {
  const writes: string[] = [];
  const out = makeOutput((text) => writes.push(text));

  out.section('🌊', 'Results');

  assertEquals(writes.length, 1);
  assert(writes[0].startsWith('\n'), 'section output should start with a newline');
  assert(writes[0].endsWith('\n'), 'section output should end with a newline');
  assert(writes[0].includes('🌊 Results'), 'section output should include the emoji and title');
});

Deno.test('writeAll drains partial writes until the full text is written', () => {
  const written: number[] = [];
  const stream = {
    writeSync(p: Uint8Array): number {
      const n = Math.min(3, p.length); // simulate a stream accepting 3 bytes at a time
      written.push(...p.subarray(0, n));
      return n;
    },
  };

  writeAll(stream, 'abç→😀'); // multi-byte UTF-8: 1+1+2+3+4 = 11 bytes

  assertEquals(new TextDecoder().decode(new Uint8Array(written)), 'abç→😀');
});

Deno.test('writeAll throws on a stalled stream instead of spinning forever', () => {
  const stream = { writeSync: () => 0 };

  assertThrows(() => writeAll(stream, 'abc'), Error, 'no progress');
});
