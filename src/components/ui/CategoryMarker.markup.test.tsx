import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import CategoryMarker from "./CategoryMarker";

test("renders a colored strawberry only for the strawberry theme", () => {
  const berry = renderToStaticMarkup(
    <CategoryMarker color="#ff9815" strawberry />,
  );
  const dot = renderToStaticMarkup(
    <CategoryMarker color="#ff9815" strawberry={false} />,
  );

  expect(berry).toContain('data-category-marker="berry"');
  expect(berry).toContain("#ff9815");
  expect(dot).toContain('data-category-marker="dot"');
});
