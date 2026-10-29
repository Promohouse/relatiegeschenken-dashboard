/**
 * Voorbeeld-XML van ANDA Present, naar hun *XML and CSV feed manual* v3.2
 * (28-04-2026).
 *
 * Dit is XML en geen object: de connector parseert zelf, dus de test moet
 * langs diezelfde parser. De velden en waarden komen uit hun voorbeelden en
 * veldbeschrijvingen; de duidelijke tikfouten in hun voorbeeld (een niet
 * gesloten `primarycolorCode`) zijn hier wel gesloten, anders test je de
 * foutafhandeling van de parser in plaats van onze vertaling.
 *
 * **Niet geverifieerd tegen een echt bestand.** De feeds zijn nog niet
 * geactiveerd.
 */

/** Twee kleuren van hetzelfde artikel, plus een onderdeel van een samenstelling. */
export const PRODUCT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<products>
  <product>
    <itemNumber>AP741951-02</itemNumber>
    <designName>Martins</designName>
    <primaryColor>yellow</primaryColor>
    <primarycolorCode>02</primarycolorCode>
    <name>customisable thermo mug</name>
    <description>Customisable, double wall plastic thermo mug with drinking lid and silicone grip. 400 ml. MOQ: 50 pcs.</description>
    <primaryImage>https://data.cdn-andapresent.com/web_product_images_low-res/AP741951/AP741951-02.jpg</primaryImage>
    <images>
      <image>https://data.cdn-andapresent.com/web_product_images_low-res/AP741951/AP741951-02.jpg</image>
      <image>https://data.cdn-andapresent.com/web_product_images_low-res/AP741951/AP741951-02__DG.jpg</image>
    </images>
    <temporarilyUnavailable>0</temporarilyUnavailable>
    <customProduction>0</customProduction>
    <minimumOrderQuantity>50</minimumOrderQuantity>
    <individualProductWeightGram>240</individualProductWeightGram>
    <countryOfOrigin>CN</countryOfOrigin>
    <tariffNumber>3924100090</tariffNumber>
    <brandName>ANDA</brandName>
    <eanCode>5996425016816</eanCode>
    <rootItemNumber>AP741951</rootItemNumber>
    <multiple>500</multiple>
    <lastModifiedDate>2024-03-22T19:07:00+01:00</lastModifiedDate>
    <assemblyProduct>0</assemblyProduct>
    <specification>
      <property>
        <type>Material 1</type>
        <name>Matériel 1</name>
        <values><value>Plastic</value></values>
      </property>
      <property>
        <type>Size</type>
        <name>Taille</name>
        <values><value>ø85×155 mm</value></values>
      </property>
    </specification>
    <categories>
      <category><name>Travel and Thermo mugs</name><level>3</level><externalId>14063</externalId></category>
      <category><name>Flasks and thermo mugs</name><level>2</level><externalId>14060</externalId></category>
      <category><name>Food and Drinkware</name><level>1</level><externalId>14000</externalId></category>
    </categories>
    <productCertificate>
      <conformity>https://data.cdn-andapresent.com/certificate/AP781155-77.pdf</conformity>
    </productCertificate>
    <testReports>
      <test_report>https://data.cdn-andapresent.com/test_report/AP864040_ROHS.pdf</test_report>
    </testReports>
  </product>
  <product>
    <itemNumber>AP741951-10</itemNumber>
    <designName>Martins</designName>
    <primaryColor>black</primaryColor>
    <primarycolorCode>10</primarycolorCode>
    <name>customisable thermo mug</name>
    <primaryImage>https://data.cdn-andapresent.com/web_product_images_low-res/AP741951/AP741951-10.jpg</primaryImage>
    <temporarilyUnavailable>1</temporarilyUnavailable>
    <eanCode>5996425016823</eanCode>
    <rootItemNumber>AP741951</rootItemNumber>
    <assemblyProduct>0</assemblyProduct>
  </product>
  <product>
    <itemNumber>AP892006-06_B</itemNumber>
    <name>Creacup onderdeel</name>
    <rootItemNumber>AP892006</rootItemNumber>
    <assemblyProduct>1</assemblyProduct>
  </product>
</products>`

/** Prijsfeed: per artikel een catalogusprijs en onze inkoopprijs. */
export const PRICE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<prices>
  <price>
    <itemNumber>AP810803-10_XS</itemNumber>
    <currency>EUR</currency>
    <amount>6.25</amount>
    <type>listPrice</type>
  </price>
  <price>
    <itemNumber>AP810803-10_XS</itemNumber>
    <currency>EUR</currency>
    <amount>2.5</amount>
    <type>discountPrice</type>
  </price>
  <price>
    <itemNumber>AP741951-02</itemNumber>
    <currency>EUR</currency>
    <amount>9.90</amount>
    <type>listPrice</type>
  </price>
</prices>`

/** Voorraadfeed: meerdere regels per artikel, één per voorraadsoort. */
export const INVENTORY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<inventories>
  <record>
    <itemNumber>AP741878</itemNumber>
    <type>central_stock</type>
    <amount>12149</amount>
    <moreThanAmount>0</moreThanAmount>
    <arrivalDate/>
  </record>
  <record>
    <itemNumber>AP741878</itemNumber>
    <type>incoming_to_central_stock</type>
    <amount>20000</amount>
    <moreThanAmount>0</moreThanAmount>
    <arrivalDate>2027-01-10</arrivalDate>
  </record>
  <record>
    <itemNumber>AP741878</itemNumber>
    <type>incoming_to_central_stock</type>
    <amount>10000</amount>
    <moreThanAmount>0</moreThanAmount>
    <arrivalDate>2026-12-21</arrivalDate>
  </record>
  <record>
    <itemNumber>AP741878</itemNumber>
    <type>external_stock</type>
    <amount>233928</amount>
    <moreThanAmount>0</moreThanAmount>
    <arrivalDate/>
  </record>
  <record>
    <itemNumber>AP892006</itemNumber>
    <type>central_stock</type>
    <amount>0</amount>
    <moreThanAmount>0</moreThanAmount>
    <arrivalDate/>
  </record>
  <record>
    <itemNumber>AP892006</itemNumber>
    <type>external_stock</type>
    <amount>4500</amount>
    <moreThanAmount>0</moreThanAmount>
    <arrivalDate/>
  </record>
</inventories>`

/** Labeling feed: posities met technieken, per artikelnummer. */
export const LABELING_XML = `<?xml version="1.0" encoding="UTF-8"?>
<labelings>
  <labeling>
    <itemNumber>AP6155-06</itemNumber>
    <printTemplate>https://admin.andapresent.com/product_attachments/AP718685/attachment/printTemplate</printTemplate>
    <lastModifiedDate>2024-03-22T19:07:00+01:00</lastModifiedDate>
    <positions>
      <position>
        <serial>I</serial>
        <posName>Below clip - right handed</posName>
        <posImage>https://xml.andapresent.com/images/0x0/auto/ap6155-06-ipreview.jpg</posImage>
        <technologies>
          <technology>
            <Code>P0</Code>
            <Name>Pad printing</Name>
            <maxColor>4</maxColor>
            <maxWmm>50</maxWmm>
            <maxHmm>7</maxHmm>
            <maxDmm/>
            <fixedSize>0</fixedSize>
          </technology>
          <technology>
            <Code>UVA</Code>
            <Name>UV LED printing</Name>
            <maxColor>Full Color</maxColor>
            <maxWmm>60</maxWmm>
            <maxHmm>6</maxHmm>
            <maxDmm/>
            <fixedSize>0</fixedSize>
          </technology>
        </technologies>
      </position>
      <position>
        <serial>II</serial>
        <posName>Below clip - left handed</posName>
        <technologies>
          <technology>
            <Code>P0</Code>
            <Name>Pad printing</Name>
            <maxColor>4</maxColor>
            <maxWmm>50</maxWmm>
            <maxHmm>7</maxHmm>
            <fixedSize>0</fixedSize>
          </technology>
        </technologies>
      </position>
    </positions>
  </labeling>
</labelings>`
