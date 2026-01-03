import React, { Fragment } from 'react';
import { Listbox, Transition } from '@headlessui/react';
import { ChevronDownIcon, CheckIcon } from '@heroicons/react/24/outline';

interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  options: DropdownOption[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  placeholder?: string;
  multiple?: boolean;
}

export const Dropdown: React.FC<DropdownProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  multiple = false,
}) => {
  const displayValue = () => {
    if (multiple && Array.isArray(value)) {
      if (value.length === 0) return placeholder;
      return `${value.length} selected`;
    }
    const selected = options.find((opt) => opt.value === value);
    return selected ? selected.label : placeholder;
  };

  return (
    <Listbox value={value} onChange={onChange} multiple={multiple}>
      <div className="relative">
        <Listbox.Button className="relative w-full cursor-pointer rounded-lg bg-white py-2 pl-3 pr-10 text-left border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
          <span className="block truncate text-sm">{displayValue()}</span>
          <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
            <ChevronDownIcon className="h-4 w-4 text-gray-400" aria-hidden="true" />
          </span>
        </Listbox.Button>
        <Transition
          as={Fragment}
          leave="transition ease-in duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-sm shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
            {options.map((option) => (
              <Listbox.Option
                key={option.value}
                value={option.value}
                className={({ active }) =>
                  `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                    active ? 'bg-indigo-50 text-indigo-900' : 'text-gray-900'
                  }`
                }
              >
                {({ selected }) => (
                  <>
                    <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                      {option.label}
                    </span>
                    {selected && (
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-indigo-600">
                        <CheckIcon className="h-4 w-4" aria-hidden="true" />
                      </span>
                    )}
                  </>
                )}
              </Listbox.Option>
            ))}
          </Listbox.Options>
        </Transition>
      </div>
    </Listbox>
  );
};
