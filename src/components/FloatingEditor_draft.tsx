import React, { useState, useRef, useLayoutEffect } from 'react';

// ★ 浮動エディタ：セル自体を再レンダリングせず、グリッドの上に重ねて編集する
const FloatingEditor = ({
    isEditing,
    activeCellKey,
    initialValue,
    onSave,
    pendingInputRef,
    lastSelectedWrapperRef
}: {
    isEditing: boolean;
    activeCellKey: string | null;
    initialValue: string;
    onSave: (val: string) => void;
    pendingInputRef: React.MutableRefObject<string>;
    lastSelectedWrapperRef: React.MutableRefObject<HTMLElement | null>;
}) => {
    const [localValue, setLocalValue] = useState(initialValue);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const [style, setStyle] = useState<React.CSSProperties>({ display: 'none' });

    // 編集モードに入った瞬間、直前の選択セルの位置に合わせる
    useLayoutEffect(() => {
        if (isEditing && lastSelectedWrapperRef.current) {
            const wrapper = lastSelectedWrapperRef.current;
            const rect = wrapper.getBoundingClientRect();
            const containerRect = wrapper.closest('.relative')?.getBoundingClientRect();

            // 親コンテナ相対座標に変換（簡易計算）
            // 実際にはもっと厳密な計算が必要だが、簡易的にwrapperのstyleをコピーする手もある
            // ここでは既存のselectionOverlayと同じロジックを使うべきだが、
            // 簡易的に fixed position か absolute で実装

            // wrapper自体に input を被せるのが最もズレない
            // しかし「セルを再レンダリングしない」なら、ここ（Global）でやる必要がある

            // 一旦、display: blockにする
            // 座標計算は親から渡された方が正確かもだが、ここで計算する

            // ★ 座標計算ロジック
            // wrapperは table > tbody > tr > td > div.editable-cell-wrapper
            // 親の div.overflow-x-auto (relative) からの相対位置が必要

            if (containerRect) {
                setStyle({
                    display: 'block',
                    position: 'absolute',
                    top: (wrapper.offsetTop + (wrapper.offsetParent as HTMLElement)?.offsetTop) + 'px', // 概算
                    left: (wrapper.offsetLeft + (wrapper.offsetParent as HTMLElement)?.offsetLeft) + 'px',
                    width: wrapper.offsetWidth + 'px',
                    height: wrapper.offsetHeight + 'px',
                    zIndex: 2010,
                    background: 'white'
                });
            }

            // 初期値セット（Ref優先）
            const val = pendingInputRef.current !== "" ? pendingInputRef.current : initialValue;
            setLocalValue(val);

            // フォーカス
            requestAnimationFrame(() => {
                if (inputRef.current) {
                    inputRef.current.focus();
                    inputRef.current.setSelectionRange(val.length, val.length);
                }
            });
        } else {
            setStyle({ display: 'none' });
            setLocalValue(""); // Reset
        }
    }, [isEditing, activeCellKey, lastSelectedWrapperRef]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setLocalValue(e.target.value);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSave(localValue);
        }
        // Escapeなどは親のGridが拾うが、stopPropagationしないと親も拾ってしまう
        // 親のonKeyDownと役割分担が必要
    };

    if (!isEditing) return null;

    return (
        <div style={style} className="floating-editor shadow-lg border-2 border-blue-500">
            <textarea
                ref={inputRef}
                className="w-full h-full p-1 resize-none outline-none text-center bg-white"
                value={localValue}
                onChange={handleChange}
                onBlur={() => onSave(localValue)}
                onKeyDown={handleKeyDown}
                style={{ lineHeight: '21px', overflow: 'hidden' }}
            />
        </div>
    );
};
