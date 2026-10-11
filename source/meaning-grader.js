/* Chinese meaning answers are checked against the meanings in the user's library.
 * This deliberately does not guess synonyms or accept arbitrary substrings.
 * The functions also export under CommonJS for the standalone regression tests.
 */
function v4MeaningText(value) {
  if (typeof value !== 'string' || value.length > 12000) return '';
  // A circled sense number is also a boundary when a pasted word list has no separators.
  return value.replace(/[①-⑳❶-❿㉑-㉟㊱-㊿]/gu, '\n1. ').normalize('NFKC');
}

function v4SplitMeaningText(value) {
  const parts = [];
  const closers = { '(': ')', '[': ']', '【': '】' };
  const stack = [];
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    // Keep a Chinese list marker attached to its definition, otherwise "一、需要"
    // would accidentally make the marker "一" an acceptable answer.
    const numberingComma = character === '、' && /^(?:\d{1,3}|[一二三四五六七八九十]+)$/u.test(v4StripMeaningPrefix(value.slice(start, index)));
    if (closers[character]) stack.push(closers[character]);
    else if (stack.length && character === stack[stack.length - 1]) stack.pop();
    else if (!stack.length && !numberingComma && (/[;；,，、/／|｜\r\n]/u.test(character) || v4IsMeaningColon(value, start, index))) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

function v4IsMeaningColon(value, start, index) {
  if (!/[:：]/u.test(value[index])) return false;
  const before = v4NormalizeMeaningPart(value.slice(start, index) + ':');
  const after = value.slice(index + 1).trimStart();
  // Some textbook lists use a colon between short Chinese meanings, such as
  // "环境:境遇". A POS label, topic label, or a usage note is not a meaning.
  return /^[\p{Script=Han}]{1,12}$/u.test(before)
    && !/^(?:词义|释义|意思|解释|例句|例|注)$/u.test(before)
    && !v4IsMeaningAnnotation(before)
    && /^[\p{Script=Han}]/u.test(after);
}

function v4StripMeaningPrefix(value) {
  let text = value.trim().replace(/^[“”‘’"']+|[“”‘’"']+$/gu, '');
  // A loop handles combinations such as "1. vt. 需要" and "(2) adj. 热情的".
  for (let count = 0; count < 5; count += 1) {
    const previous = text;
    text = text
      .replace(/^\s*(?:[-•·]\s*|\((?:\d{1,3}|[一二三四五六七八九十]+)\)\s*|(?:\d{1,3}|[一二三四五六七八九十]+)[.、)\]]\s*)/u, '')
      .replace(/^\s*(?:(?:vt|vi|adj|adv|prep|pron|conj|interj|aux|num|art|n|v)\s*\.(?:\s*(?:&|\+|and\b)\s*(?:vt|vi|adj|adv|prep|pron|conj|interj|aux|num|art|n|v)\s*\.)*[\s:：]*|(?:及物动词|不及物动词|形容词|副词|名词|动词|介词|代词|连词|数词|感叹词)[\s:：]+)(?![A-Za-z])/iu, '')
      .trim();
    if (text === previous) break;
  }
  return text;
}

function v4NormalizeMeaningPart(value) {
  return v4StripMeaningPrefix(value)
    .replace(/[\s\u200B-\u200D\u2060\uFEFF]+/gu, '')
    .replace(/^[“”‘’"'。.!！?？:：…]+|[“”‘’"'。.!！?？:：…]+$/gu, '')
    .toLowerCase();
}

function v4MeaningParentheses(value) {
  const closers = { '(': ')', '[': ']', '【': '】' };
  const stack = [];
  const notes = [];
  let start = -1;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (closers[character]) {
      if (!stack.length) start = index;
      stack.push(closers[character]);
    } else if (stack.length && character === stack[stack.length - 1]) {
      stack.pop();
      if (!stack.length) notes.push({ start, end: index + 1, content: value.slice(start + 1, index) });
    }
  }
  return notes;
}

function v4IsMeaningAnnotation(value) {
  const text = v4NormalizeMeaningPart(value);
  return /^(?:人|物|事物|人或物|某人|某物|某事|英|美|英国|美国|口|书|口语|书面语|俚语|正式|非正式|常用|不常用|旧|古|方言|贬义|褒义|中性|单数|复数|可数|不可数|物理|化学|生物|数学|医学|法律|计算机|经济|军事|语言学|音|形|名|动|副|形容词|名词|动词|副词|及物|不及物|vt\.?|vi\.?|adj\.?|adv\.?|n\.?|v\.?)$/iu.test(text)
    || /^(?:通常(?:用于|用作|用来|指)|一般(?:用于|用作|用来|指)|主要(?:用于|用作|用来|指)|多用于|常用于|尤指|尤用于|用于|用作|用来|适用于|指(?:人|物|某|的是|代)|形容(?:人|物|某|事)|修饰|(?:对|于|向|给|在|与|从|比|被|把|由|为|因)(?:某|人|物)|后接|接名词|接动词|接介词|过去式|过去分词|现在分词|比较级|最高级|固定搭配|词性|语法|缩写|注[:：]?|例[:：]?|例如|如[:：]|with\b|of\b|to\b|in\b|esp\b)/iu.test(text);
}

function v4MeaningPartOfSpeech(value) {
  const english = /\b(adj|adv|vt|vi|prep|pron|conj|interj|aux|num|art|n|v)\s*\./iu.exec(value);
  if (english) return /^(?:adj|adv)$/iu.test(english[1]) ? 'particle' : 'other';
  const chinese = /(及物动词|不及物动词|形容词|副词|名词|动词|介词|代词|连词|数词|感叹词)[\s:：]+/u.exec(value);
  if (chinese) return /^(?:形容词|副词)$/u.test(chinese[1]) ? 'particle' : 'other';
  return null;
}

function v4MayOmitMeaningParticle(value, partOfSpeech) {
  if (partOfSpeech === 'other' || value.length <= 1 || !/[的地]$/u.test(value)) return false;
  // The last character in these nouns is part of the word, rather than a particle.
  if (/(?:目的|标的|有的|无的)$/u.test(value)) return false;
  if (/(?:土|大|陆|当|场|基|田|耕|领|属|驻|工|营|宅|住|湿|高|低|盆|洼|山|林|荒|草|空|平|圣|胜|墓|坟|阵|战|殖民|目的|出生|居住|所在|聚集|发源|根据|发祥|自留|用|质|原|就|异|各|内|外|本|腹|余|要|天|雪|冰|盐|沼泽|失|占领|不毛之)地$/u.test(value)) return false;
  return true;
}

function v4MeaningAlternatives(meaning) {
  const text = v4MeaningText(meaning);
  const answers = new Set();
  let partOfSpeech = null;
  const add = value => {
    const normalized = v4NormalizeMeaningPart(value);
    if (!normalized || !/\p{Script=Han}/u.test(normalized)) return;
    answers.add(normalized);
    // These particles can be omitted, but are not removed from the middle of a phrase.
    if (v4MayOmitMeaningParticle(normalized, partOfSpeech)) answers.add(normalized.slice(0, -1));
  };

  for (const raw of v4SplitMeaningText(text)) {
    partOfSpeech = v4MeaningPartOfSpeech(raw) || partOfSpeech;
    const segment = v4StripMeaningPrefix(raw);
    if (!segment) continue;
    const notes = v4MeaningParentheses(segment);
    let base = '';
    let offset = 0;
    for (const note of notes) {
      base += segment.slice(offset, note.start);
      offset = note.end;
    }
    base += segment.slice(offset);
    if (v4NormalizeMeaningPart(base)) {
      add(base);
      // An answer copied with the dictionary's explanatory brackets is still valid.
      add(segment);
    }

    for (const note of notes) {
      const content = note.content.trim();
      const explicitAlias = /^(?:(?:又作|也作|亦作|又称|也称|亦称|或称|或作|同义(?:词)?)[\s:：]*|(?:即|或)[\s:：]+)/u;
      const hasAliasMarker = explicitAlias.test(content);
      const aliasText = content.replace(explicitAlias, '');
      if (hasAliasMarker) {
        for (const alias of v4SplitMeaningText(aliasText)) {
          const cleanAlias = v4NormalizeMeaningPart(alias);
          if (v4IsMeaningAnnotation(alias) || !/^[\p{Script=Han}]+$/u.test(cleanAlias)) continue;
          add(alias);
        }
      }
      // Optional short qualifiers are accepted together with the actual meaning;
      // "(河)岸" accepts "岸" and "河岸", never "河" on its own.
      if (note.start === 0 && v4NormalizeMeaningPart(base) && !hasAliasMarker && !v4IsMeaningAnnotation(content)
          && /^[\p{Script=Han}]{1,2}$/u.test(v4NormalizeMeaningPart(content))) {
        add(segment.slice(0, note.start) + content + segment.slice(note.end));
      }
    }
  }
  return [...answers];
}

function v4CheckMeaning(answer, meaning) {
  const answerText = v4MeaningText(answer);
  const allowed = new Set(v4MeaningAlternatives(meaning));
  const supplied = v4SplitMeaningText(answerText).map(v4NormalizeMeaningPart).filter(Boolean);
  // All supplied meanings must be right, so adding random guesses does not help.
  return supplied.length > 0 && allowed.size > 0 && supplied.every(part => allowed.has(part));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { v4MeaningAlternatives, v4CheckMeaning };
}
