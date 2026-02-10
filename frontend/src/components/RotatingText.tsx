interface RotatingTextProps {
  words: string[];
  className?: string;
}

export function RotatingText({ words, className = "" }: RotatingTextProps) {
  if (!words || words.length === 0) return null;
  
  // Duplicate the first word at the end for seamless loop
  const wordsWithLoop = [...words, words[0]];
  const itemHeight = 1.2; // em
  const animationDuration = 4.5; // seconds
  const numWords = words.length; // Original number of words (without duplicate)
  const pausePercentage = 22; // percentage of time to pause on each word
  const transitionPercentage = 3; // percentage for transition between words
  const stepPercentage = pausePercentage + transitionPercentage; // 25% per word

  // Calculate keyframe percentages based on the example pattern
  const keyframes: string[] = [];
  
  for (let i = 0; i < numWords; i++) {
    const pauseStart = i * stepPercentage;
    const pauseEnd = pauseStart + pausePercentage;
    const nextStart = (i + 1) * stepPercentage;
    
    // Pause on word
    keyframes.push(`${pauseStart}%, ${pauseEnd}% { transform: translateY(-${i * itemHeight}em); }`);
  }
  
  // Final position (back to first word, which is duplicated at the end)
  keyframes.push(`100% { transform: translateY(-${numWords * itemHeight}em); }`);

  return (
    <>
      <style>{`
        @keyframes slideUp {
          ${keyframes.join('\n          ')}
        }
        .rotating-text-wrapper {
          animation: slideUp ${animationDuration}s infinite ease-in-out;
        }
      `}</style>
      <span className="inline-block overflow-hidden align-baseline min-w-[200px] text-center" style={{ lineHeight: '1.2em', height: '1.2em' }}>
        <div className="rotating-text-wrapper">
          {wordsWithLoop.map((word, index) => (
            <div
              key={index}
              className={`h-[1.2em] flex items-center justify-center ${className}`}
              style={{ lineHeight: '1.2em' }}
            >
              {word}
            </div>
          ))}
        </div>
      </span>
    </>
  );
}


