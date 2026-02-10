import * as React from "react";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { DayPicker, useNavigation } from "react-day-picker";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

// Custom Caption component that shows "Month Year" as clickable text
function CustomCaption(props: { displayMonth: Date; fromYear?: number; toYear?: number }) {
  const { displayMonth, fromYear = 1900, toYear = 2100 } = props;
  const { goToMonth } = useNavigation();
  const [monthOpen, setMonthOpen] = React.useState(false);
  const [yearOpen, setYearOpen] = React.useState(false);
  const yearScrollRef = React.useRef<HTMLDivElement>(null);

  const monthName = format(displayMonth, "MMMM");
  const year = displayMonth.getFullYear();

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const years = Array.from({ length: toYear - fromYear + 1 }, (_, i) => toYear - i);
  const selectedYearRef = React.useRef<HTMLButtonElement | null>(null);

  // Auto-scroll to selected year when dropdown opens
  React.useEffect(() => {
    if (!yearOpen) return;
    
    const scrollToSelected = () => {
      const element = selectedYearRef.current;
      if (element && yearScrollRef.current) {
        const container = yearScrollRef.current;
        const elementTop = element.offsetTop;
        const elementHeight = element.offsetHeight;
        const containerHeight = container.clientHeight;
        const scrollTop = elementTop - (containerHeight / 2) + (elementHeight / 2);
        
        container.scrollTo({
          top: scrollTop,
          behavior: "smooth"
        });
      }
    };
    
    // Wait for popover to render
    const timeoutId = setTimeout(scrollToSelected, 100);
    return () => clearTimeout(timeoutId);
  }, [yearOpen, year]);

  const handleMonthSelect = (monthIndex: number) => {
    // Use the first day of the month to avoid date rollover issues
    const newDate = new Date(displayMonth.getFullYear(), monthIndex, 1);
    goToMonth(newDate);
    setMonthOpen(false);
  };

  const handleYearSelect = (selectedYear: number) => {
    // Keep the same month and use the first day to avoid date rollover issues
    const newDate = new Date(selectedYear, displayMonth.getMonth(), 1);
    goToMonth(newDate);
    setYearOpen(false);
  };

  return (
    <div className="flex justify-center items-center gap-1 pt-1">
      <Popover open={monthOpen} onOpenChange={setMonthOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className="h-7 px-2 text-sm font-medium hover:bg-accent"
          >
            {monthName}
            <ChevronDown className="ml-1 h-3 w-3 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-1" align="start">
          <div className="max-h-[300px] overflow-y-auto">
            {months.map((month, index) => (
              <button
                key={month}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleMonthSelect(index);
                }}
                className={cn(
                  "w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground",
                  index === displayMonth.getMonth() && "bg-accent text-accent-foreground font-medium"
                )}
              >
                {month}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <Popover open={yearOpen} onOpenChange={setYearOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className="h-7 px-2 text-sm font-medium hover:bg-accent"
          >
            {year}
            <ChevronDown className="ml-1 h-3 w-3 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-32 p-1" align="start">
          <div ref={yearScrollRef} className="max-h-[300px] overflow-y-auto">
            {years.map((y) => (
              <button
                key={y}
                ref={(el) => {
                  if (y === year) {
                    selectedYearRef.current = el;
                  }
                }}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleYearSelect(y);
                }}
                className={cn(
                  "w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground",
                  y === year && "bg-accent text-accent-foreground font-medium"
                )}
              >
                {y}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function Calendar({ className, classNames, showOutsideDays = true, fromYear, toYear, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      weekStartsOn={1}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "sr-only",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day: cn(
          buttonVariants({ variant: "ghost" }), 
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100",
          "[&.weekend]:bg-gradient-to-br [&.weekend]:from-muted/25 [&.weekend]:to-muted/8 [&.weekend.day_selected]:bg-primary [&.weekend.day_today]:bg-accent"
        ),
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside:
          "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      modifiers={{
        weekend: (date) => {
          const dayOfWeek = date.getDay();
          return dayOfWeek === 0 || dayOfWeek === 6;
        },
      }}
      modifiersClassNames={{
        weekend: "weekend",
      }}
      components={{
        IconLeft: ({ ..._props }) => <ChevronLeft className="h-4 w-4" />,
        IconRight: ({ ..._props }) => <ChevronRight className="h-4 w-4" />,
        Caption: (props) => <CustomCaption {...props} fromYear={fromYear} toYear={toYear} />,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
