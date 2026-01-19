import React, { useState } from 'react';

interface EditableCellProps {
  value: string | number;
  onChange: (value: string) => void;
  type?: 'text' | 'number';
  suffix?: string;  // 「時間」「円」など
  align?: 'left' | 'center' | 'right';
  className?: string;
}

const EditableCell: React.FC<EditableCellProps> = ({
  value,
  onChange,
  type = 'text',
  suffix,
  align = 'left',
  className = ''
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(value));

  const handleBlur = () => {
    setIsEditing(false);
    onChange(editValue);
  };

  const displayValue = value ? `${value}${suffix || ''}` : '';

  return (
    <td
      className={`editable-cell ${className}`}
      style={{ textAlign: align }}
      onClick={() => setIsEditing(true)}
    >
      {isEditing ? (
        <input
          type={type}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => e.key === 'Enter' && handleBlur()}
          autoFocus
        />
      ) : (
        displayValue
      )}
    </td>
  );
};

export default EditableCell;
