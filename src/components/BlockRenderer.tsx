import type { Block } from '../types/blocks';
import TextBlock from './blocks/TextBlock';
import CheckboxBlock from './blocks/CheckboxBlock';
import SliderBlock from './blocks/SliderBlock';
import TextAreaBlock from './blocks/TextAreaBlock';
import DatePickerBlock from './blocks/DatePickerBlock';
import MultiSelectBlock from './blocks/MultiSelectBlock';
import ImageBlock from './blocks/ImageBlock';
import BodyMapBlock from './blocks/BodyMapBlock';


interface BlockRendererProps {
  block: Block;
  onChange: (value: string | number | boolean | string []) => void;
  readOnly?: boolean;
  hideLabel?: boolean;
}

export default function BlockRenderer({ block, onChange, readOnly = false, hideLabel = false }: BlockRendererProps) {
  switch (block.type) {
    case 'text':
      return <TextBlock block={block} onChange={onChange} readOnly={readOnly} hideLabel={hideLabel} />;
    
    case 'checkbox':
      return <CheckboxBlock block={block} onChange={onChange} readOnly={readOnly} hideLabel={hideLabel} />;
    
    case 'slider':
      return <SliderBlock block={block} onChange={onChange} readOnly={readOnly} hideLabel={hideLabel} />;
    
    case 'textarea':
      return <TextAreaBlock block={block} onChange={onChange} readOnly={readOnly} hideLabel={hideLabel} />;
    
    case 'date':
      return <DatePickerBlock block={block} onChange={onChange} readOnly={readOnly} hideLabel={hideLabel} />;
    
    case 'multiselect':
      return <MultiSelectBlock block={block} onChange={onChange} readOnly={readOnly} hideLabel={hideLabel} />;
    
    case 'image':
      return <ImageBlock block={block} onChange={onChange} readOnly={readOnly} hideLabel={hideLabel} />;
    
    case 'bodymap':
      return <BodyMapBlock block={block} onChange={onChange} readOnly={readOnly} hideLabel={hideLabel} />;
    
    default:
      return (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            Unbekannter Block-Typ: {block.type}
          </p>
        </div>
      );
  }
}