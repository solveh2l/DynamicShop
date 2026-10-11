DynamicShop


MOCK HACKATHON PROJECT (LOCAL MOSTLY — except for arcade api calls, which will also be cached to avoid real time calls during demo)

By the time a retail brand notices a viral trend, designs a product, clears it through supply chain, and launches a media campaign, the trend is completely dead. We work in retail media and data science—we decided to build an enterprise engine that reduces that 3-week timeline to mere moments.

Instead of showing a boring banner ad for a generic brand, our engine takes a product page as input, identifies a complementary accessory (Scarves / Ribbon Scarves / Pocket Squares), finds the latest viral design aesthetic for that accessory, and injects it as a shoppable ad on the product page—all in seconds.


(All Mocked): "We built The Viral Vector Engine. Our engine takes a product page, identifies a complementary accessory, finds the latest viral design aesthetic for it, pulls a production-ready image and guaranteed price from Arcade, and pushes a dynamic shoppable ad live into the product page's ad slot in real-time."



Demo Flow (sequential steps):

locally hosted ecomm website --> PDP page with sponsored ad slot --> Demand Intelligence (mock complementary item + style) --> Prompt Generator (mock Gemini call) --> Arcade Engine (calls Arcade API chain: categories/list → patterns/create → products/create → checkouts/create, cached) --> Product image injected back into the HTML page's ad block


| Component | How It Uses Your Expertise | The Arcade API Hook |
| --- | --- | --- |
| Demand Intelligence (mock_complementary_item + prompt_generator) | Takes an input signal (product type) and returns a complementary product type + style, then makes a mock Gemini call to find the latest viral design aesthetic for that product + style. | Converts the trend into an optimal structural design prompt. |
| The Arcade Engine | Calls the Arcade APIs (https://docs.arcade.ai/quickstart) using the confirmed chain: categories/list → patterns/create → products/create → checkouts/create. Returns the product image and checkout information. | Renders the live Arcade image and an "Instant Checkout" button right inside the banner. |
| The Adtech Layer | A beautiful sponsored product banner embedded right inside a product page that instantly updates to display the viral item. | Injects the generated image back into the HTML page's ad block. |

Instead of building a manual design storefront, your engine uses virality to identify community micro-trends and social signals, matches them to a curated aesthetic matrix, and automatically spits out a premium, shoppable product line into an interactive ad banner or social link. It treats the Arcade API as an on-demand, algorithmic fashion house.

Note: The three components above (Demand Intelligence, Arcade Engine, Adtech Layer) run sequentially as steps in the demo — not as three side-by-side panels. The generated image is cached so repeated calls pull the same item and never call Arcade again.
