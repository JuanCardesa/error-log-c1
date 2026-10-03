import type { Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { studyTextIndex } from './studyText';

const parser = unified().use(remarkParse).use(remarkGfm);
export function notebookStudyText(markdown: string): string {
  return studyTextIndex(parser.parse(markdown) as Root).text;
}
