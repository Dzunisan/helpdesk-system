import { ChevronDown, Menu } from 'lucide-react'
import { useState } from 'react'
import ProfileDropDown from './ProfileDropDown'
import { useAuth } from '../../context/AuthContext'

const TopHeader = ({ onMenuClick }: { onMenuClick?: () => void }) => {

  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  return (
      <div className="flex h-16 position sticky top-0 z-1 shrink-0 items-center justify-between border-b border-border bg-background px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            className="-m-2.5 p-2.5 text-muted-foreground hover:text-primary md:hidden mr-4"
            onClick={onMenuClick}
          >
            <span className="sr-only">Open sidebar</span>
            <Menu className="h-6 w-6" />
          </button>
          {/* Search Bar */}
          <div className="flex flex-1 items-center gap-x-4 self-stretch lg:gap-x-6">
            <form className="relative flex flex-1" action="#" method="GET">
           
         
            </form>

            {/* Right Side Header Items */}
            <div className="flex items-center gap-x-4 lg:gap-x-6">
           

              <div
                className="hidden lg:block lg:h-6 lg:w-px lg:bg-border"
                aria-hidden="true"
              />

              {/* Profile dropdown */}
              <div className="flex items-center gap-x-4">
                <button
                  type="button"
                  className="flex items-center gap-x-3 p-1.5 outline-none cursor-pointer"
                  onClick={() => setIsOpen(!isOpen)}
                >
                  <img
                    className="h-8 w-8 rounded-full bg-muted"
                    src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
                    alt="User Avatar"
                  />
                  <span className="hidden lg:flex lg:items-center">
                    <span
                      className="text-sm font-semibold leading-6 text-foreground"
                      aria-hidden="true"
                    >
                      {user?.name || "User"}
                    </span>
                    <ChevronDown className="ml-2 h-5 w-5 text-muted-foreground" />
                  </span>
                </button>
              </div>

              {isOpen && (
                <ProfileDropDown onClose={() => setIsOpen(false)} />
              )}
            </div>
          </div>
        </div>
  );
};

export default TopHeader