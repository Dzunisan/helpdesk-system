import React from "react";
import { Link } from "react-router-dom";

type NavigationItem = {
  name: string;
  href: string;
  current: boolean;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

const SideBar = ({navigation, setSelectedPage, closeSidebar}: {navigation: NavigationItem[], setSelectedPage?: React.Dispatch<React.SetStateAction<string>>, closeSidebar?: () => void}) => {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-4 py-8">
      <nav className="flex flex-1 flex-col">
        <ul role="list" className="flex flex-1 flex-col gap-y-7">
          <li>
            <ul role="list" className="-mx-2 space-y-1">
              {navigation.map((item) => (
                <li key={item.name}>
                  <Link
                    to={item.href}
                    className={`group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold ${
                      item.current
                        ? "bg-accent text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-primary"
                    }`}
                    onClick={() => {
                      if (setSelectedPage) setSelectedPage(item.name);
                      if (closeSidebar) closeSidebar();
                    }}
                  >
                    <item.icon
                      className={`h-6 w-6 shrink-0 ${
                        item.current
                          ? "text-primary"
                          : "text-muted-foreground group-hover:text-primary"
                      }`}
                    />
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        </ul>
      </nav>
    </div>
  );
};

export default SideBar;
