// Browser interim results are replaceable. Append finalized results only once.
export function readDictationResults(results, committedCount = 0) {
  let nextCount = committedCount;
  const parts = [];
  while (nextCount < results.length && results[nextCount].isFinal) {
    parts.push(results[nextCount][0]?.transcript || '');
    nextCount += 1;
  }
  return {
    committedCount: nextCount,
    transcript: parts.join(' ').trim(),
    interim: Array.from(results).slice(nextCount).map(result => result[0]?.transcript || '').join(' ').trim()
  };
}
