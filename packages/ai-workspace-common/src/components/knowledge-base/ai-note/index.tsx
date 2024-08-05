import { useEffect, useMemo, useRef } from 'react';
import wordsCount from 'words-count';
import getClient from '@refly-packages/ai-workspace-common/requests/proxiedRequest';
import { Note } from '@refly/openapi-schema';

import './index.scss';
import { useCookie } from 'react-use';
import { Button, Divider, Input, Spin, Switch, Tabs } from '@arco-design/web-react';
import { IconLock, IconUnlock } from '@arco-design/web-react/icon';
import { useSearchParams } from 'react-router-dom';
import { IconClockCircle, IconEdit, IconSearch } from '@arco-design/web-react/icon';
import { editorEmitter } from '@refly-packages/ai-workspace-common/utils/event-emitter/editor';
import { useListenToSelection } from '@refly-packages/ai-workspace-common/hooks/use-listen-to-selection';
// 编辑器组件
import {
  CollabEditorCommand,
  CollabGenAIMenuSwitch,
  CollabGenAIBlockMenu,
} from '@refly-packages/editor-component/advanced-editor';
import { EditorRoot } from '@refly-packages/editor-core/components';
import { EditorContent, type JSONContent, EditorInstance } from '@refly-packages/editor-core/components';
import { DeleteDropdownMenu } from '@refly-packages/ai-workspace-common/components/knowledge-base/delete-dropdown-menu';
import { ImageResizer, handleCommandNavigation } from '@refly-packages/editor-core/extensions';
import { defaultExtensions } from '@refly-packages/editor-component/extensions';
import { uploadFn } from '@refly-packages/editor-component/image-upload';
import { slashCommand } from '@refly-packages/editor-component/slash-command';
import { HocuspocusProvider } from '@hocuspocus/provider';
import Collaboration from '@tiptap/extension-collaboration';
import { useDebouncedCallback } from 'use-debounce';
import { handleImageDrop, handleImagePaste } from '@refly-packages/editor-core/plugins';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
// 编辑器样式
// 图标
import { AiOutlineWarning, AiOutlineFileWord } from 'react-icons/ai';
import hljs from 'highlight.js';
import { useSearchStore } from '@refly-packages/ai-workspace-common/stores/search';
import { getWsServerOrigin } from '@refly-packages/utils/url';
import { useNoteStore } from '@refly-packages/ai-workspace-common/stores/note';
import { useNoteTabs } from '@refly-packages/ai-workspace-common/hooks/use-note-tabs';
import { useAINote } from '@refly-packages/ai-workspace-common/hooks/use-ai-note';
import { AINoteEmpty } from '@refly-packages/ai-workspace-common/components/knowledge-base/ai-note-empty';

const CollaborativeEditor = ({ noteId, note }: { noteId: string; note: Note }) => {
  const { readOnly } = note;
  const lastCursorPosRef = useRef<number>();
  const [token] = useCookie('_refly_ai_sid');
  const noteStore = useNoteStore();
  const editorRef = useRef<EditorInstance>();

  // 准备 extensions
  const websocketProvider = useMemo(() => {
    return new HocuspocusProvider({
      url: getWsServerOrigin(),
      name: noteId,
      token,
    });
  }, [noteId]);

  const extensions = [
    ...defaultExtensions,
    slashCommand,
    Collaboration.configure({
      document: websocketProvider.document,
    }),
    CollaborationCursor.configure({
      provider: websocketProvider,
    }),
  ];

  //Apply Codeblock Highlighting on the HTML from editor.getHTML()
  const highlightCodeblocks = (content: string) => {
    const doc = new DOMParser().parseFromString(content, 'text/html');
    doc.querySelectorAll('pre code').forEach((el) => {
      // @ts-ignore
      // https://highlightjs.readthedocs.io/en/latest/api.html?highlight=highlightElement#highlightelement
      hljs.highlightElement(el);
    });
    return new XMLSerializer().serializeToString(doc);
  };

  const debouncedUpdates = useDebouncedCallback(async (editor: EditorInstance) => {
    const json = editor.getJSON();
    const markdown = editor.storage.markdown.getMarkdown();
    noteStore.updateNoteCharsCount(wordsCount(markdown));
    window.localStorage.setItem('html-content', highlightCodeblocks(editor.getHTML()));
    window.localStorage.setItem('novel-content', JSON.stringify(json));
    window.localStorage.setItem('markdown', editor.storage.markdown.getMarkdown());
    noteStore.updateNoteSaveStatus('Saved');
  }, 500);

  useEffect(() => {
    // Update status changes
    websocketProvider.on('status', (event) => {
      noteStore.updateNoteServerStatus(event.status);
    });

    return () => {
      websocketProvider.forceSync();
      websocketProvider.destroy();
      editorRef.current.destroy();
    };
  }, []);

  useEffect(() => {
    if (editorRef.current && !readOnly) {
      editorRef.current.on('blur', () => {
        lastCursorPosRef.current = editorRef.current?.view?.state?.selection?.$head?.pos;
        console.log('cursor position', lastCursorPosRef.current);
      });
    }
  }, [editorRef.current, readOnly]);

  useEffect(() => {
    editorEmitter.on('insertBlow', (content) => {
      const isFocused = editorRef.current?.isFocused;

      if (isFocused) {
        lastCursorPosRef.current = editorRef.current?.view?.state?.selection?.$head?.pos;
        editorRef.current?.commands?.insertContentAt?.(lastCursorPosRef.current, content);
      } else if (lastCursorPosRef.current) {
        editorRef.current
          .chain()
          .focus(lastCursorPosRef.current)
          .insertContentAt(
            {
              from: lastCursorPosRef.current,
              to: lastCursorPosRef.current,
            },
            content,
          )
          .run();
      }
    });
  }, []);

  useListenToSelection(`ai-note-editor`, 'note');

  useEffect(() => {
    if (editorRef.current) {
      if (readOnly) {
        // ensure we sync the content just before setting the editor to readonly
        websocketProvider.forceSync();
      }
      editorRef.current.setOptions({ editable: !readOnly });
    }
  }, [readOnly]);

  return (
    <div className="editor">
      <div className="w-full h-full max-w-screen-lg">
        <EditorRoot>
          <EditorContent
            extensions={extensions}
            onCreate={({ editor }) => {
              editorRef.current = editor;
              noteStore.updateEditor(editor);
            }}
            editable={!readOnly}
            className="w-full h-full max-w-screen-lg border-muted sm:rounded-lg"
            editorProps={{
              handleDOMEvents: {
                keydown: (_view, event) => handleCommandNavigation(event),
              },
              handlePaste: (view, event) => handleImagePaste(view, event, uploadFn),
              handleDrop: (view, event, _slice, moved) => handleImageDrop(view, event, moved, uploadFn),
              attributes: {
                class: 'prose prose-lg prose-headings:font-title font-default focus:outline-none max-w-full',
              },
            }}
            onUpdate={({ editor }) => {
              debouncedUpdates(editor);
              noteStore.updateNoteSaveStatus('Unsaved');
            }}
            slotAfter={<ImageResizer />}
          >
            <CollabEditorCommand />
            <CollabGenAIMenuSwitch />
            <CollabGenAIBlockMenu />
          </EditorContent>
        </EditorRoot>
      </div>
    </div>
  );
};

interface AINoteStatusBarProps {
  note: Note;
}

export const AINoteStatusBar = (props: AINoteStatusBarProps) => {
  const { note } = props;
  const { noteId } = note;
  const noteStore = useNoteStore();
  const { handleDeleteTab } = useNoteTabs();

  return (
    <div className="note-status-bar">
      <div className="note-status-bar-menu">
        {noteId && noteStore.noteServerStatus === 'connected' ? (
          <div className="note-status-bar-item">
            <AiOutlineFileWord />
            <p className="conv-title">共 {noteStore.noteCharsCount} 字</p>
          </div>
        ) : null}
        {noteId && noteStore.noteServerStatus === 'disconnected' ? (
          <div className="note-status-bar-item">
            <Divider type="vertical" />
            <AiOutlineWarning />
            <p className="conv-title">服务已断开</p>
          </div>
        ) : null}
        {noteId && noteStore.noteServerStatus === 'connected' ? (
          <div className="note-status-bar-item">
            <Divider type="vertical" />
            <IconClockCircle />
            <p className="conv-title">{noteStore.noteSaveStatus === 'Saved' ? `笔记已自动保存` : `笔记保存中...`}</p>
          </div>
        ) : null}
      </div>
      <div className="note-status-bar-menu">
        {noteId ? (
          <div className="note-status-bar-item">
            {note.readOnly ? <IconLock /> : <IconUnlock />}
            <p className="conv-title mr-2">{note.readOnly ? '只读' : '编辑'}</p>
            <Switch
              type="round"
              size="small"
              checked={note.readOnly}
              onChange={(readOnly) => noteStore.updateCurrentNote({ ...note, readOnly })}
            />
          </div>
        ) : null}
        <div className="note-status-bar-item">
          <Divider type="vertical" />
          <DeleteDropdownMenu type="note" data={note} postDeleteList={(note: Note) => handleDeleteTab(note.noteId)} />
        </div>
      </div>
    </div>
  );
};

interface AINoteHeaderProps {
  note: Note;
  onTitleChange: (newTitle: string) => void;
}

export const AINoteHeader = (props: AINoteHeaderProps) => {
  const { note, onTitleChange } = props;

  return (
    <div className="mx-4 mt-8 flex justify-center align-middle">
      <div className="w-full h-full max-w-screen-lg">
        <Input
          className="bg-transparent text-3xl font-bold focus:border-transparent focus:bg-transparent"
          placeholder="Enter The Title"
          value={note.title}
          onChange={onTitleChange}
        />
      </div>
    </div>
  );
};

export const AINote = () => {
  const [searchParams] = useSearchParams();
  const noteId = searchParams.get('noteId');

  const { handleInitEmptyNote } = useAINote();
  const noteStore = useNoteStore();
  const note = noteStore.currentNote;
  const prevNote = useRef<Note>();

  const searchStore = useSearchStore();

  const { tabs, activeTab, setActiveTab, handleAddTab, handleDeleteTab, handleUpdateTabTitle } = useNoteTabs();

  useEffect(() => {
    return () => {
      noteStore.updateNotePanelVisible(false);
    };
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      const { data } = await getClient().getNoteDetail({
        query: { noteId },
      });
      const note = data?.data;
      if (note) {
        noteStore.updateCurrentNote(note);
        noteStore.updateIsRequesting(false);
        handleAddTab({
          title: note.title,
          key: note.noteId,
          content: note.contentPreview || '',
          noteId: note.noteId,
        });
      }
    };
    if (noteId) {
      fetchData();
    }
  }, [noteId]);

  const debouncedUpdateNote = useDebouncedCallback(async (note: Note) => {
    const res = await getClient().updateNote({
      body: {
        noteId: note.noteId,
        title: note.title,
        readOnly: note.readOnly,
        isPublic: note.isPublic,
      },
    });
    if (res.error) {
      console.error(res.error);
      return;
    }
  }, 500);

  useEffect(() => {
    if (note && prevNote.current?.noteId === note.noteId) {
      debouncedUpdateNote(note);
    }
    prevNote.current = note;
  }, [note, debouncedUpdateNote]);

  if (noteId === undefined || noteId == null || noteId === '') {
    return <AINoteEmpty />;
  }

  if (!note) {
    return <Spin dot block className="h-full w-full flex justify-center items-center" />;
  }

  const onTitleChange = (newTitle: string) => {
    noteStore.updateCurrentNote({ ...note, title: newTitle });
    handleUpdateTabTitle(note.noteId, newTitle);
  };

  return (
    <div className="ai-note-container">
      <Tabs
        editable
        type="card-gutter"
        className="note-detail-tab-container"
        activeTab={activeTab}
        onDeleteTab={handleDeleteTab}
        onAddTab={() => handleInitEmptyNote('')}
        onChange={setActiveTab}
        renderTabHeader={(props, DefaultTabHeader) => {
          return (
            <div className="note-detail-header">
              <div className="note-detail-nav-switcher">
                <DefaultTabHeader {...props} />
              </div>
              <div className="note-detail-navigation-bar">
                <Button
                  icon={<IconSearch style={{ fontSize: 16 }} />}
                  type="text"
                  shape="circle"
                  className="assist-action-item"
                  onClick={() => {
                    searchStore.setPages(searchStore.pages.concat('note'));
                    searchStore.setIsSearchOpen(true);
                  }}
                ></Button>
              </div>
            </div>
          );
        }}
      >
        {tabs.map((tab, i) => (
          <Tabs.TabPane destroyOnHide key={tab.key} title={tab.title}>
            <div></div>
          </Tabs.TabPane>
        ))}
      </Tabs>
      {note ? (
        <div className="ai-note-editor">
          <AINoteHeader note={note} onTitleChange={onTitleChange} />
          <CollaborativeEditor key={noteId} noteId={noteId} note={note} />
        </div>
      ) : null}
      {note ? <AINoteStatusBar note={note} /> : null}
    </div>
  );
};
