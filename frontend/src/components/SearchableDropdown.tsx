import React, { useState, useRef, useEffect } from 'react';

interface SearchableDropdownProps {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}

const SearchableDropdown: React.FC<SearchableDropdownProps> = ({
  options,
  value,
  onChange,
  placeholder = "Search and select...",
  disabled = false,
  style = {}
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter options based on search term
  const filteredOptions = options.filter(option =>
    option.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    option.value.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Find the selected option's label
  const selectedOption = options.find(option => option.value === value);
  const displayValue = selectedOption ? selectedOption.label : '';
  

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSearchTerm = e.target.value;
    setSearchTerm(newSearchTerm);
    setHighlightedIndex(-1);
    
    // If user clears the input, clear the selection
    if (newSearchTerm === '') {
      onChange('');
    }
  };

  // Handle option selection
  const handleOptionSelect = (optionValue: string) => {
    onChange(optionValue);
    setSearchTerm('');
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  // Handle input focus
  const handleInputFocus = () => {
    setIsOpen(true);
    // Clear search term when opening dropdown to allow fresh search
    setSearchTerm('');
  };

  // Handle input click - allow editing
  const handleInputClick = () => {
    setIsOpen(true);
    setSearchTerm('');
  };

  // Handle input blur
  const handleInputBlur = (e: React.FocusEvent) => {
    // Don't close if clicking on dropdown
    if (dropdownRef.current && dropdownRef.current.contains(e.relatedTarget as Node)) {
      return;
    }
    // Add a small delay to allow click events to process
    setTimeout(() => {
      setIsOpen(false);
      setSearchTerm('');
      setHighlightedIndex(-1);
    }, 150);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        setIsOpen(true);
        return;
      }
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < filteredOptions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
          handleOptionSelect(filteredOptions[highlightedIndex].value);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setSearchTerm('');
        setHighlightedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const defaultStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    ...style
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px',
    fontSize: '16px',
    border: '2px solid #e0e0e0',
    borderRadius: '8px',
    backgroundColor: 'white',
    cursor: disabled ? 'not-allowed' : (isOpen ? 'text' : 'pointer'),
    transition: 'border-color 0.2s',
    opacity: disabled ? 0.6 : 1,
    boxSizing: 'border-box',
    color: value && !isOpen ? '#043873' : 'inherit',
    fontWeight: value && !isOpen ? '500' : 'normal'
  };

  const dropdownStyle: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: 'white',
    border: '2px solid #e0e0e0',
    borderTop: 'none',
    borderRadius: '0 0 8px 8px',
    maxHeight: '200px',
    overflowY: 'auto',
    zIndex: 1000,
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
  };

  const optionStyle: React.CSSProperties = {
    padding: '12px',
    cursor: 'pointer',
    borderBottom: '1px solid #f0f0f0',
    fontSize: '14px',
    transition: 'background-color 0.2s',
    backgroundColor: '#f9f9f9'
  };

  const highlightedOptionStyle: React.CSSProperties = {
    ...optionStyle,
    backgroundColor: '#f0f8ff',
    color: '#043873'
  };

  const noOptionsStyle: React.CSSProperties = {
    padding: '12px',
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center'
  };

  return (
    <div style={defaultStyle} ref={dropdownRef}>
      <input
        ref={inputRef}
        type="text"
        value={isOpen ? searchTerm : (value ? displayValue : '')}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onClick={handleInputClick}
        onBlur={handleInputBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        style={inputStyle}
        readOnly={!isOpen && value ? true : false}
      />
      
      {isOpen && (
        <div style={dropdownStyle}>
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option, index) => (
              <div
                key={option.value}
                style={index === highlightedIndex ? highlightedOptionStyle : optionStyle}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleOptionSelect(option.value);
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                {option.label}
              </div>
            ))
          ) : (
            <div style={noOptionsStyle}>
              No options found
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchableDropdown;
