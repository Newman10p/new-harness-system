import re

with open('/home/z/my-project/new-harness-system/public/index.html', 'r') as f:
    content = f.read()

changes = 0

# 1. Replace splitIntoSentences
old_split = '''    function splitIntoSentences(text) {
      // Split on sentence boundaries but keep delimiters
      const chunks = [];
      // Match sentences: ends with . ! ? followed by space or end,
      // or natural break points like semicolons, em-dashes
      const regex = /[^.!?;]+[.!?;]+\s*|[^.!?;]+$/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const chunk = match[0].trim();
        if (chunk) chunks.push(chunk);
      }
      // If no sentence boundaries found, split by commas or just use whole text
      if (chunks.length === 0) {
        // Try comma splitting for long text
        if (text.length > 100) {
          const parts = text.split(/,\s*/);
          for (const part of parts) {
            if (part.trim()) chunks.push(part.trim());
          }
        } else {
          chunks.push(text);
        }
      }
      return chunks;
    }'''

new_split = '''    function splitIntoSentences(text) {
      const chunks = [];
      // Split on sentence boundaries (. ! ? ;) followed by space or end
      const regex = /[^.!?;]+[.!?;]+\s*|[^.!?;]+$/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const chunk = match[0].trim();
        // Skip tiny fragments (file extensions, abbreviations like "md.", "e.g.")
        // Merge them back into the previous chunk instead of synthesizing separately
        if (chunk && chunk.length > 8) {
          chunks.push(chunk);
        } else if (chunk && chunks.length > 0) {
          chunks[chunks.length - 1] += " " + chunk;
        } else if (chunk) {
          chunks.push(chunk);
        }
      }
      // If nothing found, use whole text
      if (chunks.length === 0) {
        chunks.push(text);
      }
      return chunks;
    }'''

if old_split in content:
    content = content.replace(old_split, new_split)
    print('OK: Replaced splitIntoSentences')
    changes += 1
else:
    print('WARN: splitIntoSentences not found')

# 2. Remove the prefetch block from processSpeakQueue
old_prefetch = '''        // Pre-fetch: start synthesizing the NEXT sentence while
        // current one plays (pipeline effect \u2014 feels real-time)
        if (state._speakQueue.length > 0) {
          const next = state._speakQueue[0];
          if (next.engine === "piper" && next.piperReady) {
            prefetchPiper(next.text);
          }
        }'''

new_prefetch = '        // No prefetch \u2014 synthesizes on demand to avoid doubled requests'

if old_prefetch in content:
    content = content.replace(old_prefetch, new_prefetch)
    print('OK: Removed prefetch block')
    changes += 1
else:
    print('WARN: prefetch block not found')

# 3. Strip inline code (file paths) from TTS text entirely
old_code_line = "        .replace(/\`{1,3}([^\`]+)\`{1,3}/g, \"$1\")                // inline code"
new_code_line = "        .replace(/\`[^\`]+\`/g, \"\")                              // remove inline code (file paths etc)"

if old_code_line in content:
    content = content.replace(old_code_line, new_code_line)
    print('OK: Updated inline code stripping')
    changes += 1
else:
    print('WARN: inline code line not found')

with open('/home/z/my-project/new-harness-system/public/index.html', 'w') as f:
    f.write(content)

print(f'\n{changes}/3 changes applied')
