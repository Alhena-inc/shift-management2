# Update Summary: IME Input, Enter Navigation, and Blue Border Fixes

## Overview
This update addresses three key issues related to user interaction within the `ShiftTable` component: IME input handling, specific Enter key navigation logic, and the stability of the selection highlight (blue border).

## Changes

### 1. IME Input Fix
- **Issue**: Typing Japanese characters (e.g., "na" -> "な") on a selected cell often resulted in incorrect composition (e.g., "nあ") due to interference from `textContent` clearing or selection ranges.
- **Fix**: 
  - Modified `handleKeyDown` in `ShiftTable.tsx`.
  - Instead of complex range manipulation, we now simply clear `textContent` and re-focus the cell when a character key is pressed.
  - This ensures a clean state for the browser's native IME composition to take over, preventing "ghost" characters.

### 2. Enter Key Navigation
- **Issue**: The user requested distinct behaviors for the Enter key depending on the visual line within a cell.
- **Fix**:
  - Updated `onKeyDown` in `ShiftTable.tsx`.
  - **Line 0 (1st line) & Line 2 (3rd line)**: Pressing Enter **once** now immediately moves the selection to the cell below, skipping edit mode. This streamlines data entry for these fields.
  - **Line 1 (2nd line) & Line 3 (4th line)**: Retained valid behavior where the first Enter enters edit mode, and a second Enter moves the selection.

### 3. Blue Border Stability
- **Issue**: The blue selection border (`.line-selected`) would sometimes disappear unexpectedly, particularly after double-clicking or certain interactions.
- **Fix**:
  - Adjusted `onMouseDown` logic in `ShiftTable.tsx` to be less aggressive in clearing the selection class.
  - Added `src/index.css` (and committed it) to ensure the `.line-selected` class has the correct styling (`outline: 2px solid #2563eb`).
  - Added logic to prevent accidental removal of the class during multi-select clearing routines if the single-select logic coincides.

## Verification
- **IME**: Type "na" in a cell. It should appear as "な" (after conversion) without an initial "n".
- **Enter (Lines 0/2)**: Select a cell on the 1st or 3rd line. Press Enter. Focus should move to the cell below.
- **Enter (Lines 1/3)**: Select a cell on the 2nd or 4th line. Press Enter. Cell should enter edit mode. Press Enter again. Focus should move to the cell below.
- **Blue Border**: Click and double-click cells. The blue outline should remain visible on the active row/cell.

## Status
- Changes are applied to `src/components/ShiftTable.tsx` and `src/index.css`.
- Changes are committed locally.
- **Note**: `npm install` was triggered to resolve TypeScript errors and environment issues. Please ensure it completes.
