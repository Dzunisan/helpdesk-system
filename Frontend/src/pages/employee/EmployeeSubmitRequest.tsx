import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Search, SearchX, Shapes, X } from "lucide-react";
import { listCategories } from "@/services/categories";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Category } from "@/types/api";
import PageHeader from "@/components/app/PageHeader";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import CategoryTiles, { CategoryTilesSkeleton } from "@/components/request/CategoryTiles";
import NewRequestSteps from "@/components/request/NewRequestSteps";
import { useApiData } from "@/components/portal/useApiData";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";

const matches = (category: Category, query: string) =>
  `${category.category_name} ${category.description ?? ""} ${category.department_name}`.toLowerCase().includes(query);

const isSomethingElse = (category: Category) => category.category_name.toLowerCase() === "something else";

/**
 * New request, step 1: choose a category (briefing p.38, S5). Asks *what*, not *who*: the
 * category decides the department, priority and approval on the server.
 * `?selected=<id>` keeps the choice when the employee comes back with "Change".
 */
export default function EmployeeSubmitRequest() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data, error, loading, refreshing, reload } = useApiData(() => listCategories(), "categories");
  // "Something else" always comes last in its group: it's the fallback, not a first choice
  const categories = useMemo(
    () => [...(data?.categories ?? [])].sort((a, b) => Number(isSomethingElse(a)) - Number(isSomethingElse(b))),
    [data],
  );
  const isMobile = useIsMobile();

  const [picked, setPicked] = useState<string>(params.get("selected") ?? "");
  const [search, setSearch] = useState("");

  const query = search.trim().toLowerCase();
  const visible = useMemo(() => (query ? categories.filter((c) => matches(c, query)) : categories), [categories, query]);
  const somethingElse = categories.find(isSomethingElse);
  // A choice that is no longer listed (deactivated meanwhile) doesn't count
  const selected = categories.some((c) => String(c.category_id) === picked) ? picked : "";

  const goToDetails = (value = selected) => {
    if (value) navigate(`/employee/submit-request/${value}`);
  };

  // Phones: one category per row with a chevron, so a tap goes straight to the details (p.45)
  const pick = (value: string) => {
    setPicked(value);
    if (isMobile) goToDetails(value);
  };

  const chooseSomethingElse = () => {
    if (!somethingElse) return;
    setSearch("");
    setPicked(String(somethingElse.category_id));
  };

  let body;
  if (loading) {
    body = <CategoryTilesSkeleton />;
  } else if (error && !data) {
    body = <ErrorState title="Couldn't load the categories" onRetry={reload} retrying={refreshing} />;
  } else if (categories.length === 0) {
    body = (
      <EmptyState
        variant="card"
        icon={Shapes}
        title="Nothing to choose from yet"
        description="No team is taking requests right now. Please try again later."
      />
    );
  } else if (visible.length === 0) {
    body = (
      <EmptyState
        variant="card"
        icon={SearchX}
        title={`Nothing matches “${search.trim()}”`}
        description="Try another word, or choose Something else and the service desk will route it."
        action={
          <>
            <Button variant="outline" onClick={() => setSearch("")}>
              Clear search
            </Button>
            {somethingElse && <Button onClick={chooseSomethingElse}>Choose Something else</Button>}
          </>
        }
      />
    );
  } else {
    body = <CategoryTiles categories={visible} value={selected} onValueChange={pick} onPick={goToDetails} />;
  }

  return (
    <div className="flex flex-col gap-8">
      <NewRequestSteps current={0} />

      <PageHeader
        title="What do you need help with?"
        description="Pick the closest match. We'll send it to the right team, so you don't need to know who handles what."
      />

      <div className="flex flex-col gap-6">
        <InputGroup className="h-11 bg-background">
          <InputGroupAddon>
            <Search aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label="Search categories"
            placeholder='Search, e.g. "vpn" or "payslip"'
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="[&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <InputGroupAddon align="inline-end">
              <InputGroupText className="hidden text-xs tabular-nums sm:inline">
                {visible.length} {visible.length === 1 ? "category" : "categories"}
              </InputGroupText>
              <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => setSearch("")}>
                <X />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>

        {body}
      </div>

      {/* Phones go straight to the details on tap, so the footer is for larger screens */}
      {categories.length > 0 && !isMobile && (
        <div className="flex flex-col gap-4">
          <Separator />
          <div className="flex items-center justify-between gap-6">
            <p className="text-sm text-muted-foreground">
              Not sure?{" "}
              {somethingElse ? (
                <Button variant="link" className="h-auto p-0 align-baseline font-semibold" onClick={chooseSomethingElse}>
                  Choose Something else
                </Button>
              ) : (
                "Choose Something else"
              )}{" "}
              and the service desk will route it.
            </p>
            <Button size="lg" className="h-10 shrink-0" disabled={!selected} onClick={() => goToDetails()}>
              Continue
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
