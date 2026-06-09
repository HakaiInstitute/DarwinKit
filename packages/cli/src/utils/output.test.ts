import { assert, assertEquals } from '@std/assert';
import { makeOutput } from './output.ts';

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
