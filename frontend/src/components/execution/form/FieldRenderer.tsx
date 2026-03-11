import { TextField } from "./fields/TextField";
import { NumberField } from "./fields/NumberField";
import { BooleanField } from "./fields/BooleanField";
import { DateField } from "./fields/DateField";
import { OptionField } from "./fields/OptionField";
import { FileField } from "./fields/FileField";

import { ArrayField } from "./fields/ArrayField";
import { HtmlField } from "./fields/HtmlField";
import { TimeField } from "./fields/TimeField";
import { DateTimeField } from "./fields/DateTimeField";
import { SignatureField } from "./fields/SignatureField";

interface FieldRendererProps {
  field: any;
  value: any;
  onChange: (value: any) => void;
  disabled?: boolean;
  required?: boolean;
  labelPosition?: "top" | "side" | "hidden"; // Position of the label: "top" (above), "side" (beside), or "hidden" (no label)
  // Props for OptionField
  dynamicOptions?: string[];
  isLoadingDynamic?: boolean;
  dynamicError?: { message: string; type: string };
  onRetryDynamic?: () => void;
  // Props for FileField
  onUpload?: (file: File) => void;
  onViewFile?: (url: string, name: string, path: string) => void;
  onDelete?: (filePath: string) => Promise<void>; // Delete file from storage
  isUploading?: boolean;
  signedUrl?: string;
  // Context for ArrayField to render children
  childFields?: any[]; // The full list of fields to find children from
  renderChild?: (field: any, value: any, onChange: (val: any) => void, hideLabel?: boolean) => React.ReactNode;
  // Callback to get a signed URL for a storage path (used by ArrayField for ZIP download)
  getSignedUrl?: (path: string, filename?: string) => Promise<string | null>;
  // Field configuration from form settings
  fieldConfig?: {
    compact_mode?: boolean;
    array_child_fields?: Record<string, { shown: boolean; required: boolean; readonly?: boolean }>;
    array_enable_duplicate?: boolean;
    array_enable_add_item?: boolean;
    array_enable_delete?: boolean;
  };
  // Optional brand/portal primary color (e.g. company portal) for checkbox, options, etc.
  primaryColor?: string;
}

export const FieldRenderer = (props: FieldRendererProps) => {
  const { field, value, onChange, disabled, required, labelPosition = "top", primaryColor, ...otherProps } = props;
  const fieldType = field.field_type || field.type || "text";

  switch (fieldType) {
    case "text":
    case "email":
    case "password":
      return <TextField field={field} value={value} onChange={onChange} disabled={disabled} required={required} labelPosition={labelPosition} primaryColor={primaryColor} />;

    case "number":
      return <NumberField field={field} value={value} onChange={onChange} disabled={disabled} required={required} labelPosition={labelPosition} primaryColor={primaryColor} />;

    case "boolean":
      return <BooleanField field={field} value={value} onChange={onChange} disabled={disabled} required={required} labelPosition={labelPosition} primaryColor={primaryColor} />;

    case "date":
      return <DateField field={field} value={value} onChange={onChange} disabled={disabled} required={required} labelPosition={labelPosition} primaryColor={primaryColor} />;

    case "time":
      return <TimeField field={field} value={value} onChange={onChange} disabled={disabled} required={required} labelPosition={labelPosition} primaryColor={primaryColor} />;

    case "datetime":
    case "datetime-local":
      return <DateTimeField field={field} value={value} onChange={onChange} disabled={disabled} required={required} labelPosition={labelPosition} primaryColor={primaryColor} />;

    case "option":
    case "multiple_option":
      return <OptionField
        field={field}
        value={value}
        onChange={onChange}
        disabled={disabled}
        required={required}
        labelPosition={labelPosition}
        primaryColor={primaryColor}
        dynamicOptions={otherProps.dynamicOptions}
        isLoadingDynamic={otherProps.isLoadingDynamic}
        dynamicError={otherProps.dynamicError}
        onRetryDynamic={otherProps.onRetryDynamic}
      />;

    case "file":
      return <FileField
        field={field}
        value={value}
        onChange={onChange}
        disabled={disabled}
        required={required}
        labelPosition={labelPosition}
        onUpload={otherProps.onUpload!}
        onView={otherProps.onViewFile!}
        onDelete={otherProps.onDelete}
        isUploading={otherProps.isUploading}
        signedUrl={otherProps.signedUrl}
        primaryColor={primaryColor}
      />;

    case "signature":
      return <SignatureField
        field={field}
        value={value}
        onChange={onChange}
        disabled={disabled}
        required={required}
        labelPosition={labelPosition}
        onUpload={otherProps.onUpload!}
        onView={otherProps.onViewFile}
        isUploading={otherProps.isUploading}
        signedUrl={otherProps.signedUrl}
        primaryColor={primaryColor}
      />;

    case "array":
      return <ArrayField
        field={field}
        value={value}
        onChange={onChange}
        disabled={disabled}
        labelPosition={labelPosition}
        childFields={otherProps.childFields || []}
        renderChild={otherProps.renderChild}
        compactMode={otherProps.fieldConfig?.compact_mode}
        arrayChildFieldsConfig={otherProps.fieldConfig?.array_child_fields}
        enableDuplicate={otherProps.fieldConfig?.array_enable_duplicate !== false}
        enableAddItem={otherProps.fieldConfig?.array_enable_add_item !== false}
        enableDelete={otherProps.fieldConfig?.array_enable_delete !== false}
        primaryColor={primaryColor}
        getSignedUrl={otherProps.getSignedUrl}
      />;

    case "html":
      return <HtmlField field={field} value={value} onChange={onChange} disabled={disabled} required={required} labelPosition={labelPosition} primaryColor={primaryColor} />;

    default:
      return <TextField field={field} value={value} onChange={onChange} disabled={disabled} required={required} labelPosition={labelPosition} primaryColor={primaryColor} />;
  }
};

