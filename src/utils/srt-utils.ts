const MAX_WORDS_PER_LINE = 4;

/**
 * Converts an SRT timestamp string (HH:MM:SS,mmm) to milliseconds.
 */
export function parseTimestampToMs(tsStr: string): number {
    try {
        const parts = tsStr.split(',');
        if (parts.length !== 2) {
            console.warn('Warning: Malformed timestamp (no comma): ' + tsStr);
            return 0;
        }
        const timePart = parts[0];
        const msPart = parts[1];
        const [h, m, s] = timePart.split(':').map(str => parseInt(str, 10));

        const msVal = parseInt(msPart, 10);

        if (isNaN(h) || isNaN(m) || isNaN(s) || isNaN(msVal)) {
            console.warn('Warning: Malformed timestamp parts encountered (NaN): ' + tsStr);
            return 0;
        }
        return (h * 3600 * 1000) + (m * 60 * 1000) + (s * 1000) + msVal;
    } catch (e: any) {
        console.warn('Warning: Exception during timestamp parsing for: ' + tsStr + '. Error: ' + e.message);
        return 0;
    }
}

/**
 * Converts milliseconds to an SRT timestamp string (HH:MM:SS,mmm).
 */
export function formatMsToTimestamp(totalMs: number): string {
    if (totalMs < 0) {
        totalMs = 0;
    }
    const ms = totalMs % 1000;
    const totalSeconds = Math.floor(totalMs / 1000);
    const s = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const m = totalMinutes % 60;
    const h = Math.floor(totalMinutes / 60);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + ',' + String(ms).padStart(3, '0');
}

/**
 * Reformats a list of text lines to adhere to a maximum number of words per line.
 * Each string in the returned list is a new text segment.
 */
function reformatTextBlock(originalTextLines: string[], maxWords: number): string[] {
    if (!originalTextLines || originalTextLines.length === 0) {
        return [];
    }

    const fullText = originalTextLines.map(line => line.trim()).filter(line => line).join(" ");
    const words = fullText.split(/\s+/).filter(word => word);

    if (words.length === 0) {
        return [""]; // Return a single empty line for an empty subtitle text
    }

    const newTextSegments: string[] = [];
    let currentLineWords: string[] = [];
    for (const word of words) {
        currentLineWords.push(word);
        if (currentLineWords.length === maxWords) {
            newTextSegments.push(currentLineWords.join(" "));
            currentLineWords = [];
        }
    }

    if (currentLineWords.length > 0) {
        newTextSegments.push(currentLineWords.join(" "));
    }

    return newTextSegments.length > 0 ? newTextSegments : [""];
}

/**
 * Reformats SRT content string.
 */
export function reformatSrtContent(srtContent: string, maxWords: number = MAX_WORDS_PER_LINE): string {
    if (typeof srtContent !== 'string') {
        console.warn('Warning: reformatSrtContent received non-string input.');
        return ""; // Return empty string for non-string input
    }
    const blocks = srtContent.trim().split(/\r?\n\s*\r?\n/); // Split by one or more newlines (Windows or Unix), then optional whitespace, then newline
    const outputSrtBlocks: string[] = [];
    let newSubtitleIndex = 1;

    for (const blockStr of blocks) {
        if (!blockStr.trim()) {
            continue;
        }

        const lines = blockStr.split('\n');
        
        if (lines.length < 2) {
            if (blockStr.trim()) {
                console.warn('Skipping malformed SRT block (not enough lines): ' + blockStr.replace(/\r?\n/g, "<NL>"));
            }
            continue;
        }

        const originalIndexLine = lines[0];
        const timestampLine = lines[1];
        const originalTextLines = lines.slice(2);

        if (!originalIndexLine.trim().match(/^\d+$/) || !timestampLine.includes("-->")) {
            if (blockStr.trim()) {
                console.warn('Skipping malformed SRT block (bad index or timestamp): ' + blockStr.replace(/\r?\n/g, "<NL>"));
            }
            continue;
        }
        
        let originalStartMs: number;
        let originalEndMs: number;
        try {
            const tsParts = timestampLine.split(" --> ");
            if (tsParts.length !== 2) {
                 console.warn('Warning: Malformed timestamp line (no --> separator): ' + timestampLine);
                 continue;
            }
            const startTsStr = tsParts[0].trim();
            const endTsStr = tsParts[1].trim();
            originalStartMs = parseTimestampToMs(startTsStr);
            originalEndMs = parseTimestampToMs(endTsStr);
        } catch (e: any) {
            console.warn('Warning: Could not parse timestamp line due to exception: ' + timestampLine + '. Error: ' + e.message);
            continue;
        }
        
        const originalDurationMs = originalEndMs - originalStartMs;

        if (originalDurationMs < 0) {
            console.warn('Warning: Negative duration for cue starting ' + formatMsToTimestamp(originalStartMs) + '. Original block: ' + blockStr.replace(/\r?\n/g, "<NL>"));
            continue;
        }

        const textSegments = reformatTextBlock(originalTextLines, maxWords);
        const numSegments = textSegments.length;

        if (numSegments === 0 || (numSegments === 1 && textSegments[0].trim() === "")) {
            continue;
        }

        let currentSegmentStartMs = originalStartMs;
        const durationPerSegmentMs = numSegments > 0 ? originalDurationMs / numSegments : originalDurationMs;
        const minSegmentDurationMs = 100; // e.g., 100ms minimum

        for (let i = 0; i < numSegments; i++) {
            const segmentText = textSegments[i];
            if (!segmentText.trim() && numSegments === 1) { // Skip if it's a single, genuinely empty segment
                continue;
            }

            const segmentStartMs = currentSegmentStartMs;
            let segmentEndMs: number;

            if (i === numSegments - 1) { // Last segment
                segmentEndMs = originalEndMs; // Ensure it ends precisely
            } else {
                segmentEndMs = Math.round(segmentStartMs + durationPerSegmentMs);
            }
            
            // Avoid overlapping or zero/negative duration for intermediate segments
            if (segmentEndMs <= segmentStartMs && i < numSegments - 1) {
                segmentEndMs = segmentStartMs + minSegmentDurationMs;
            }
            if (segmentEndMs > originalEndMs) { // Cap at original end time
                segmentEndMs = originalEndMs;
            }
             // Ensure end time is not before start time after adjustments
            if (segmentEndMs <= segmentStartMs) {
                if (originalEndMs > segmentStartMs + minSegmentDurationMs) {
                    segmentEndMs = segmentStartMs + minSegmentDurationMs;
                } else {
                     segmentEndMs = originalEndMs; // Fallback to original end if it's too tight
                }
            }
            // If it's still bad, it means the original duration was too small for this segment.
            // We might skip or use original timings. For now, we'll proceed, but this could lead to tiny durations.
             if (segmentEndMs <= segmentStartMs && originalDurationMs > 0) {
                console.warn('Segment ' + (i+1) + ' for original cue ' + originalIndexLine + ' resulted in zero or negative duration. Start: ' + segmentStartMs + ', End: ' + segmentEndMs + '. Original Duration: ' + originalDurationMs);
                // Attempt to give it a tiny valid duration if possible, or skip
                if (originalEndMs > segmentStartMs) {
                     segmentEndMs = originalEndMs; // Use remaining original duration
                } else {
                    console.warn('Skipping segment ' + (i+1) + ' of cue ' + originalIndexLine + ' due to timing issue after adjustments.');
                    currentSegmentStartMs = segmentEndMs; // this will likely break out if original_end_ms is reached
                     if (currentSegmentStartMs >= originalEndMs && i < numSegments - 1) {
                        console.warn('Warning: Ran out of time for cue (A) ' + originalIndexLine.trim() + ' after segment ' + (i+1) + '. Remaining segments will be dropped.');
                        break;
                    }
                    continue; 
                }
            }

            const newTsLine = formatMsToTimestamp(Math.round(segmentStartMs)) + " --> " + formatMsToTimestamp(Math.round(segmentEndMs));
            
            const blockParts = [String(newSubtitleIndex), newTsLine, segmentText];
            outputSrtBlocks.push(blockParts.join("\n"));
            newSubtitleIndex++;
            
            currentSegmentStartMs = segmentEndMs;
            if (currentSegmentStartMs >= originalEndMs && i < numSegments - 1) {
                console.warn('Warning: Ran out of time for cue (B) ' + originalIndexLine.trim() + ' after segment ' + (i+1) + '. Remaining segments will be dropped.');
                break;
            }
        }
    }

    let finalOutputStr = outputSrtBlocks.join("\n\n");
    if (finalOutputStr && !finalOutputStr.endsWith('\n')) {
        finalOutputStr += "\n";
    }
    return finalOutputStr;
}

// Example usage (for testing):
// const sampleSrt = \`
// 1
// 00:00:01,000 --> 00:00:05,000
// This is a rather long subtitle line that definitely needs to be split into multiple cues for better readability.
//
// 2
// 00:00:06,000 --> 00:00:08,000
// Short one.
//
// 3
// 00:00:09,000 --> 00:00:10,000
// word word word word word word
// \`;
//
// const reformatted = reformatSrtContent(sampleSrt);
// console.log(reformatted); 