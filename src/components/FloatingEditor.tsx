import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface FloatingEditorProps {
    isEditing: boolean;
    initialValue: string;
    onSave: (val: string, moveNext?: boolean) => void;
    targetElement: HTMLElement | null;
    onStartEditing: (overwrite?: boolean) => void;
    isComposingRef: React.MutableRefObject<boolean>;
    isOverwriteMode?: boolean;
}

const FloatingEditor: React.FC<FloatingEditorProps> = ({
    isEditing,
    initialValue,
    onSave,
    targetElement,
    onStartEditing,
    isComposingRef,
    isOverwriteMode = false
}) => {
    const [localValue, setLocalValue] = useState(initialValue);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const isSavingRef = useRef(false);
    const lastIsEditingRef = useRef(isEditing);
    const isFirstInputRef = useRef(false);
    const shouldOverwriteRef = useRef(false);
    const lastInitialValueRef = useRef(initialValue);

    // 自動保存用のRef
    const localValueRef = useRef(initialValue);
    const onSaveRef = useRef(onSave);

    // callbackを常に最新に保つ
    useEffect(() => {
        onSaveRef.current = onSave;
    }, [onSave]);

    // 編集開始時および非編集時の同期
    useEffect(() => {
        const initialValueChanged = lastInitialValueRef.current !== initialValue;
        lastInitialValueRef.current = initialValue;

        if (!isEditing) {
            // 非編集モード
            if (initialValueChanged) {
                setLocalValue(initialValue);
                localValueRef.current = initialValue;
            }
            isSavingRef.current = false;
            isFirstInputRef.current = false;
            shouldOverwriteRef.current = false;
        } else if (isEditing && !lastIsEditingRef.current) {
            // 編集モード開始
            setLocalValue(initialValue);
            localValueRef.current = initialValue;
            isSavingRef.current = false;
            if (isOverwriteMode || shouldOverwriteRef.current) {
                isFirstInputRef.current = false;
            }
        }
        lastIsEditingRef.current = isEditing;
    }, [isEditing, initialValue, isOverwriteMode]);

    // アンマウント時の自動保存（他のセルをクリックしたときなど）
    useEffect(() => {
        return () => {
            if (lastIsEditingRef.current && !isSavingRef.current) {
                // 自動保存を実行
                onSaveRef.current(localValueRef.current, false);
            }
        };
    }, []);

    // フォーカス制御とカーソル位置調整
    useEffect(() => {
        if (targetElement && inputRef.current) {
            const timer = requestAnimationFrame(() => {
                if (inputRef.current) {
                    inputRef.current.focus({ preventScroll: true });
                    if (isEditing) {
                        if (isFirstInputRef.current) {
                            inputRef.current.setSelectionRange(0, inputRef.current.value.length);
                        } else {
                            const len = inputRef.current.value.length;
                            inputRef.current.setSelectionRange(len, len);
                        }
                    }
                }
            });
            return () => cancelAnimationFrame(timer);
        }
    }, [isEditing, targetElement]);

    const handleSave = (val: string, moveNext = false) => {
        if (isSavingRef.current) return;
        if (!isEditing) {
            isSavingRef.current = false;
            return;
        }
        isSavingRef.current = true;
        isFirstInputRef.current = false;
        shouldOverwriteRef.current = false;
        onSave(val, moveNext);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        // IME入力中のEnterは、変換確定のみを行い、セルの移動は行わない
        if (e.nativeEvent.isComposing) return;

        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            isSavingRef.current = true;

            const eventName = e.shiftKey ? 'shift-navigate-up' : 'shift-navigate-down';
            document.dispatchEvent(new CustomEvent(eventName, {
                detail: { value: localValue }
            }));
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            handleSave(initialValue, false);
        } else if (e.key === 'Tab') {
            e.preventDefault();
            e.stopPropagation();
            isSavingRef.current = true;

            const eventName = e.shiftKey ? 'shift-navigate-left' : 'shift-navigate-right';
            document.dispatchEvent(new CustomEvent(eventName, {
                detail: { value: localValue }
            }));
        } else if ((e.key === 'Backspace' || e.key === 'Delete') && !isEditing) {
            e.preventDefault();
            e.stopPropagation();
            setLocalValue('');
            localValueRef.current = '';
            onStartEditing(true);
            setTimeout(() => {
                handleSave('', false);
            }, 0);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        setLocalValue(newValue);
        localValueRef.current = newValue;
        isFirstInputRef.current = false;

        if (!isEditing && newValue !== initialValue) {
            shouldOverwriteRef.current = true;
            onStartEditing(true);
        }
    };

    if (!targetElement) return null;

    return createPortal(
        <textarea
            ref={inputRef}
            className="cell-input"
            value={localValue}
            onChange={handleChange}
            onBlur={() => handleSave(localValue)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => { isComposingRef.current = true; }}
            onCompositionEnd={() => { isComposingRef.current = false; }}
            style={{
                position: 'absolute',
                top: 0, left: 0, width: '100%', height: '100%',
                padding: '0', resize: 'none', outline: 'none', textAlign: 'center',
                backgroundColor: isEditing ? 'white' : 'transparent',
                color: isEditing ? '#000000' : 'transparent',
                caretColor: isEditing ? 'auto' : 'transparent',
                opacity: 1, pointerEvents: 'auto',
                border: isEditing ? '2px solid #2563eb' : 'none',
                lineHeight: '21px', overflow: 'hidden',
                whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                fontFamily: 'inherit', fontSize: 'inherit', fontWeight: 'inherit',
                zIndex: isEditing ? 2010 : 2000
            }}
        />,
        targetElement
    );
};

export default FloatingEditor;
