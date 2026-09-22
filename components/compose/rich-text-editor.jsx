'use client';

import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  Undo,
  Redo,
  RemoveFormatting,
  Code,
} from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * Tiptap-based rich text editor. Emits HTML; the server sanitizes it again
 * and derives the plain-text alternative.
 */
export function RichTextEditor({ initialHtml, onChange, placeholder, autoFocus, onFiles }) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false, underline: false }),
      Underline,
      TextStyle,
      Color,
      Link.configure({
        openOnClick: false,
        autolink: true,
        protocols: ['http', 'https', 'mailto'],
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Image.configure({ inline: true, allowBase64: true }),
      Placeholder.configure({ placeholder: placeholder || 'Write something…' }),
    ],
    content: initialHtml || '',
    autofocus: autoFocus ? 'start' : false,
    editorProps: {
      attributes: {
        class: 'editor-content prose-mail text-sm leading-relaxed',
        'aria-label': 'Message body',
        'data-testid': 'compose-body',
      },
      handlePaste: (view, event) => {
        const files = [...(event.clipboardData?.files || [])];
        if (files.length && onFiles) {
          onFiles(files);
          return true;
        }
        return false;
      },
      handleDrop: (view, event) => {
        const files = [...(event.dataTransfer?.files || [])];
        if (files.length && onFiles) {
          event.preventDefault();
          onFiles(files);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  useEffect(() => () => editor?.destroy(), [editor]);

  if (!editor) return <div className="min-h-[12rem]" />;

  const setLink = () => {
    const previous = editor.getAttributes('link').href;

    const url = window.prompt('Link URL', previous || 'https://');
    if (url === null) return;
    if (!url || url === 'https://') {
      editor.chain().focus().unsetLink().run();
      return;
    }
    if (!/^(https?:|mailto:)/i.test(url)) return;
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const tools = [
    {
      label: 'Bold',
      icon: Bold,
      active: editor.isActive('bold'),
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: 'Italic',
      icon: Italic,
      active: editor.isActive('italic'),
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: 'Underline',
      icon: UnderlineIcon,
      active: editor.isActive('underline'),
      run: () => editor.chain().focus().toggleUnderline().run(),
    },
    {
      label: 'Strikethrough',
      icon: Strikethrough,
      active: editor.isActive('strike'),
      run: () => editor.chain().focus().toggleStrike().run(),
    },
    { divider: true },
    {
      label: 'Bulleted list',
      icon: List,
      active: editor.isActive('bulletList'),
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: 'Numbered list',
      icon: ListOrdered,
      active: editor.isActive('orderedList'),
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: 'Quote',
      icon: Quote,
      active: editor.isActive('blockquote'),
      run: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      label: 'Code',
      icon: Code,
      active: editor.isActive('code'),
      run: () => editor.chain().focus().toggleCode().run(),
    },
    { label: 'Link', icon: LinkIcon, active: editor.isActive('link'), run: setLink },
    {
      label: 'Clear formatting',
      icon: RemoveFormatting,
      run: () => editor.chain().focus().unsetAllMarks().clearNodes().run(),
    },
    { label: 'Undo', icon: Undo, run: () => editor.chain().focus().undo().run() },
    { label: 'Redo', icon: Redo, run: () => editor.chain().focus().redo().run() },
  ];

  return (
    <div>
      <div
        role="toolbar"
        aria-label="Text formatting"
        className="border-line mb-3 flex flex-wrap items-center gap-px border-b pb-2"
      >
        {tools.map((t, i) =>
          t.divider ? (
            <span key={`d${i}`} aria-hidden="true" className="bg-line mx-1 h-4 w-px" />
          ) : (
            <button
              key={t.label}
              type="button"
              aria-label={t.label}
              aria-pressed={t.active}
              title={t.label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={t.run}
              className={cn(
                'text-fg-secondary rounded-control grid size-7 place-items-center transition-colors duration-100',
                'hover:bg-hover hover:text-fg focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-1',
                t.active && 'bg-hover text-fg'
              )}
            >
              <t.icon className="size-4" />
            </button>
          )
        )}
        <label className="hover:bg-hover rounded-control ml-1 grid size-7 cursor-pointer place-items-center">
          <span className="sr-only">Text colour</span>
          <input
            type="color"
            aria-label="Text colour"
            className="rounded-tight size-4 cursor-pointer border-0 bg-transparent p-0"
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          />
        </label>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
