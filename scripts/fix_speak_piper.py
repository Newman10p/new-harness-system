with open('/home/z/my-project/new-harness-system/public/index.html', 'r') as f:
    lines = f.readlines()

start = None
for i, line in enumerate(lines):
    if 'Speak with Piper/Kokoro' in line and i > 1980:
        start = i - 1  # include the /** line
        break

if start is None:
    print('ERROR: Could not find speakWithPiper')
else:
    end = None
    for j in range(start, min(start + 40, len(lines))):
        if lines[j].strip() == '}':
            end = j + 1
            break
    
    if end is None:
        print('ERROR: Could not find end of speakWithPiper')
    else:
        new_func = [
            '    /**
',
            '     * Speak with Piper/Kokoro - request, wait, play. Resolves when playback ends.
',
            '     */
',
            '    function speakWithPiper(cleanText) {
',
            '      return new Promise((resolve) => {
',
            '        const id = ++state._piperReqId;
',
            '        state._piperWaitingId = id;
',
            '        state._piperResolve = resolve;
',
            '        sendWS({ type: "piper_speak", text: cleanText, id });
',
            '
',
            '        // Timeout: if no audio in 6s, fall back to browser TTS
',
            '        state._piperSpeakTimeout = setTimeout(() => {
',
            '          if (state._piperWaitingId === id) {
',
            '            state._piperWaitingId = null;
',
            '            state._piperResolve = null;
',
            '            resolve();
',
            '          }
',
            '        }, 6000);
',
            '      });
',
            '    }
',
            '
',
        ]
        lines[start:end] = new_func
        print(f'Replaced speakWithPiper (lines {start+1}-{end})')
        
        with open('/home/z/my-project/new-harness-system/public/index.html', 'w') as f:
            f.writelines(lines)
