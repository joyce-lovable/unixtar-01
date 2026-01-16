import { NavLink, useLocation } from 'react-router-dom';
import { Scan, Database } from 'lucide-react';
import { cn } from '@/lib/utils';

const MainNavigation = () => {
  const location = useLocation();
  
  const navItems = [
    { path: '/', label: '智慧辨識系統', icon: Scan },
    { path: '/data-query', label: '資料查詢', icon: Database },
  ];

  return (
    <nav className="flex items-center gap-2">
      {navItems.map((item) => {
        const isActive = location.pathname === item.path;
        const Icon = item.icon;
        
        return (
          <NavLink
            key={item.path}
            to={item.path}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200",
              isActive
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <Icon className="w-4 h-4" />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
};

export default MainNavigation;
