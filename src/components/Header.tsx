import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, MoreVertical, Edit, History, FileText, Settings } from 'lucide-react';

interface HeaderProps {
  title: string;
  onBack?: () => void;
  showMenu?: boolean;
  menuItems?: Array<{
    label: string;
    icon: 'edit' | 'history' | 'diary' | 'settings';
    onClick: () => void;
  }>;
}

export default function Header({ title, onBack, showMenu = false, menuItems = [] }: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const iconMap = {
    edit: Edit,
    history: History,
    diary: FileText,
    settings: Settings
  };

  return (
    <div className="header">
      <div className="header-content">
        {onBack ? (
          <Button onClick={onBack} variant="ghost" size="icon" className="min-w-10 min-h-10">
            <ArrowLeft size={20} />
          </Button>
        ) : (
          <div className="w-10 min-w-10"></div>
        )}
        
        <h1 className="header-title">{title}</h1>
        
        {showMenu && menuItems.length > 0 ? (
          <div className="relative">
            <Button onClick={() => setIsMenuOpen(!isMenuOpen)} variant="ghost" size="icon" className="min-w-10 min-h-10">
              <MoreVertical size={20} />
            </Button>
            
            {isMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setIsMenuOpen(false)} />
                <Card className="absolute right-0 top-12 z-20 p-2 shadow-xl min-w-[200px]">
                  {menuItems.map((item, index) => {
                    const IconComponent = iconMap[item.icon];
                    return (
                      <Button
                        key={index}
                        onClick={() => {
                          setIsMenuOpen(false);
                          item.onClick();
                        }}
                        variant="ghost"
                        className="w-full justify-start gap-3 h-11"
                      >
                        <IconComponent size={18} />
                        <span>{item.label}</span>
                      </Button>
                    );
                  })}
                </Card>
              </>
            )}
          </div>
        ) : (
          <div className="w-10 min-w-10"></div>
        )}
      </div>
    </div>
  );
}
