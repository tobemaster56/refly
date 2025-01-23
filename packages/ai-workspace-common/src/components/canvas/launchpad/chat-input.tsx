import { AutoComplete, AutoCompleteProps, Input } from 'antd';
import { memo, useRef, useMemo, useState, useCallback, forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { RefTextAreaType } from '@arco-design/web-react/es/Input/textarea';
import { useSearchStoreShallow } from '@refly-packages/ai-workspace-common/stores/search';
import type { Skill } from '@refly/openapi-schema';
import { useSkillStoreShallow } from '@refly-packages/ai-workspace-common/stores/skill';
import { cn } from '@refly-packages/utils/cn';
import { useListSkills } from '@refly-packages/ai-workspace-common/queries/queries';
import { getSkillIcon } from '@refly-packages/ai-workspace-common/components/common/icon';

const TextArea = Input.TextArea;

interface ChatInputProps {
  query: string;
  setQuery: (text: string) => void;
  selectedSkillName: string | null;
  inputClassName?: string;
  maxRows?: number;
  autoCompletionPlacement?: 'bottomLeft' | 'bottomRight' | 'topLeft' | 'topRight';
  handleSendMessage: () => void;
  handleSelectSkill?: (skill: Skill) => void;
}

const ChatInputComponent = forwardRef<HTMLDivElement, ChatInputProps>(
  (
    {
      query,
      setQuery,
      selectedSkillName,
      inputClassName,
      autoCompletionPlacement,
      maxRows,
      handleSendMessage,
      handleSelectSkill,
    },
    ref,
  ) => {
    const { t, i18n } = useTranslation();
    const language = i18n.language;

    const inputRef = useRef<RefTextAreaType>(null);
    const searchStore = useSearchStoreShallow((state) => ({
      setIsSearchOpen: state.setIsSearchOpen,
    }));
    const { setSelectedSkill } = useSkillStoreShallow((state) => ({
      setSelectedSkill: state.setSelectedSkill,
    }));
    const [showSkillSelector, setShowSkillSelector] = useState(false);

    const { data } = useListSkills({}, null, {
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
      gcTime: 10 * 60 * 1000, // Cache for 10 minutes
    });
    const skills = data?.data ?? [];

    const skillOptions = useMemo(() => {
      return skills.map((skill) => ({
        value: skill.name,
        label: (
          <div className="flex items-center gap-2 h-6">
            {getSkillIcon(skill.name)}
            <span className="text-sm font-medium">{t(`${skill.name}.name`, { ns: 'skill' })}</span>
            <span className="text-sm text-gray-500">
              {t(`${skill.name}.description`, { ns: 'skill' })}
            </span>
          </div>
        ),
        textLabel: t(`${skill.name}.name`, { ns: 'skill' }),
      }));
    }, [data, language]);

    const [options, setOptions] = useState<AutoCompleteProps['options']>([]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !showSkillSelector) {
        e.stopPropagation();
        return;
      }

      if (e.key === '/') {
        setShowSkillSelector(true);
      } else if (!['ArrowUp', 'ArrowDown', 'Enter'].includes(e.key)) {
        showSkillSelector && setShowSkillSelector(false);
      }

      if (e.keyCode === 13) {
        if (showSkillSelector && options?.length > 0) {
          e.preventDefault();
          return;
        }

        if (e.ctrlKey || e.shiftKey || e.metaKey) {
          e.preventDefault();
          if (e.target instanceof HTMLTextAreaElement) {
            const cursorPos = e.target.selectionStart ?? 0;
            const newValue = query.slice(0, cursorPos) + '\n' + query.slice(cursorPos);
            setQuery(newValue);
            setTimeout(() => {
              if (e.target instanceof HTMLTextAreaElement) {
                e.target.selectionStart = e.target.selectionEnd = cursorPos + 1;
              }
            }, 0);
          }
        } else {
          e.preventDefault();
          if (query?.trim()) {
            handleSendMessage();
          }
        }
      }

      if (e.keyCode === 75 && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        searchStore.setIsSearchOpen(true);
      }
    };

    const handleSearch = useCallback(
      (value: string) => {
        const lastSlashIndex = value.lastIndexOf('/');
        if (lastSlashIndex !== -1) {
          setOptions(skillOptions);
          setShowSkillSelector(true);
        } else {
          setOptions([]);
          setShowSkillSelector(false);
        }
      },
      [skillOptions],
    );

    const handleInputChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        setQuery(value);
      },
      [setQuery],
    );

    const handleSearchListConfirm = useCallback(
      (value: string) => {
        setOptions([]);
        setShowSkillSelector(false);
        const skill = skills.find((skill) => skill.name === value);
        if (!skill) {
          return;
        }
        if (handleSelectSkill) {
          handleSelectSkill(skill);
        } else {
          const lastSlashIndex = query.lastIndexOf('/');
          const prefix = lastSlashIndex !== -1 ? query.slice(0, lastSlashIndex) : '';
          setQuery(prefix);
          setSelectedSkill(skill);
        }
      },
      [skills, setSelectedSkill, handleSelectSkill, query],
    );

    return (
      <div ref={ref} className="w-full h-full flex flex-col flex-grow overflow-y-auto">
        <AutoComplete
          className="h-full"
          autoFocus
          open={showSkillSelector}
          options={options}
          popupMatchSelectWidth={false}
          placement={autoCompletionPlacement}
          value={query ?? ''}
          filterOption={(inputValue, option) => {
            const lastSlashIndex = inputValue.lastIndexOf('/');
            const searchText =
              lastSlashIndex !== -1 ? inputValue.slice(lastSlashIndex + 1) : inputValue;
            const searchVal = searchText.toLowerCase();
            return (
              !searchVal ||
              option.value.toString().toLowerCase().includes(searchVal) ||
              option.textLabel.toLowerCase().includes(searchVal)
            );
          }}
          onSelect={(value) => handleSearchListConfirm(value)}
          onSearch={(value) => handleSearch(value)}
        >
          <TextArea
            ref={inputRef}
            autoFocus
            onBlur={() => {
              setTimeout(() => {
                setShowSkillSelector(false);
              }, 100);
            }}
            value={query ?? ''}
            onChange={handleInputChange}
            onKeyDownCapture={(e) => handleKeyDown(e)}
            className={cn(
              '!m-0 bg-transparent outline-none box-border border-none resize-none focus:outline-none focus:shadow-none focus:border-none',
              inputClassName,
            )}
            placeholder={
              selectedSkillName
                ? t(`${selectedSkillName}.placeholder`, {
                    ns: 'skill',
                    defaultValue: t(`commonQnA.placeholder`, { ns: 'skill' }),
                  })
                : t(`commonQnA.placeholder`, { ns: 'skill' })
            }
            autoSize={{
              minRows: 1,
              maxRows: maxRows ?? 6,
            }}
          />
        </AutoComplete>
      </div>
    );
  },
);

ChatInputComponent.displayName = 'ChatInputComponent';

export const ChatInput = memo(ChatInputComponent, (prevProps, nextProps) => {
  return (
    prevProps.query === nextProps.query &&
    prevProps.selectedSkillName === nextProps.selectedSkillName &&
    prevProps.handleSelectSkill === nextProps.handleSelectSkill
  );
}) as typeof ChatInputComponent;

ChatInput.displayName = 'ChatInput';
