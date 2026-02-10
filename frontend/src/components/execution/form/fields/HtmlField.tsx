import { Label } from "@/components/ui/label";
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

interface HtmlFieldProps {
    field: any;
    value: any;
    onChange: (value: any) => void;
    disabled?: boolean;
    required?: boolean;
    labelPosition?: "top" | "side";
}

export const HtmlField = ({ field, value, onChange, disabled, required, labelPosition = "top" }: HtmlFieldProps) => {
    const modules = {
        toolbar: [
            [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
            [{ 'size': ['small', false, 'large', 'huge'] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ 'color': [] }, { 'background': [] }],
            [{ 'script': 'sub' }, { 'script': 'super' }],
            [{ 'align': [] }],
            [{ 'list': 'ordered' }, { 'list': 'bullet' }, { 'indent': '-1' }, { 'indent': '+1' }],
            ['blockquote', 'code-block'],
            ['link', 'image'],
            ['clean']
        ],
    };

    if (disabled) {
        return (
            <div className="space-y-1.5">
                <Label className="text-sm font-medium flex items-center gap-1">
                    {field.label || field.name || field.id}
                </Label>
                <div
                    className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background ql-editor"
                    dangerouslySetInnerHTML={{ __html: value || "" }}
                />
                {field.description && (
                    <p className="text-xs text-muted-foreground">{field.description}</p>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1">
                {field.label || field.name || field.id}
                {required && <span className="text-destructive">*</span>}
            </Label>
            <div className="bg-background">
                <ReactQuill
                    theme="snow"
                    value={value ?? ""}
                    onChange={onChange}
                    readOnly={disabled}
                    modules={modules}
                    placeholder={field.placeholder || "Enter content..."}
                    className="min-h-[150px]"
                />
            </div>
            {field.description && (
                <p className="text-xs text-muted-foreground">{field.description}</p>
            )}
        </div>
    );
};
