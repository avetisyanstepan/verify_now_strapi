'use strict';

var jsxRuntime = require('react/jsx-runtime');
require('react');
var designSystem = require('@strapi/design-system');
var reactIntl = require('react-intl');
var styledComponents = require('styled-components');
var InputRenderer = require('./InputRenderer.js');

const ResponsiveGridRoot = styledComponents.styled(designSystem.Grid.Root)`
  container-type: inline-size;
`;
const ResponsiveGridItem = /**
   * TODO:
   * JSDOM cannot handle container queries.
   * This is a temporary workaround so that tests do not fail in the CI when jestdom throws an error
   * for failing to parse the stylesheet.
   */ process.env.NODE_ENV !== 'test' ? styledComponents.styled(designSystem.Grid.Item)`
        grid-column: span 12;
        ${({ theme })=>theme.breakpoints.medium} {
          ${({ col })=>col && `grid-column: span ${col};`}
        }
      ` : styledComponents.styled(designSystem.Grid.Item)`
        grid-column: span 12;
      `;
const panelStyles = {
    padding: {
        initial: 4,
        medium: 6
    },
    borderColor: 'neutral150',
    background: 'neutral0',
    hasRadius: true,
    shadow: 'tableShadow'
};
const FormLayout = ({ layout, document, hasBackground = true })=>{
    const { formatMessage } = reactIntl.useIntl();
    const modelUid = document.schema?.uid;
    const getLabel = (name, label)=>{
        return formatMessage({
            id: `content-manager.content-types.${modelUid}.${name}`,
            defaultMessage: label
        });
    };
    return /*#__PURE__*/ jsxRuntime.jsx(designSystem.Flex, {
        direction: "column",
        alignItems: "stretch",
        gap: {
            initial: 4,
            large: 6
        },
        children: layout.map((panel, index)=>{
            if (panel.some((row)=>row.some((field)=>field.type === 'dynamiczone'))) {
                const [row] = panel;
                const [field] = row;
                return /*#__PURE__*/ jsxRuntime.jsx(designSystem.Grid.Root, {
                    gap: 4,
                    children: /*#__PURE__*/ jsxRuntime.jsx(designSystem.Grid.Item, {
                        col: 12,
                        s: 12,
                        xs: 12,
                        direction: "column",
                        alignItems: "stretch",
                        children: /*#__PURE__*/ jsxRuntime.jsx(InputRenderer.InputRenderer, {
                            ...field,
                            label: getLabel(field.name, field.label),
                            document: document
                        })
                    })
                }, field.name);
            }
            return /*#__PURE__*/ jsxRuntime.jsx(designSystem.Box, {
                ...hasBackground && panelStyles,
                children: /*#__PURE__*/ jsxRuntime.jsx(designSystem.Flex, {
                    direction: "column",
                    alignItems: "stretch",
                    gap: {
                        initial: 4,
                        large: 6
                    },
                    children: panel.map((row, gridRowIndex)=>{
                        return /*#__PURE__*/ jsxRuntime.jsx(ResponsiveGridRoot, {
                            gap: 4,
                            children: row.map(({ size, ...field })=>{
                                return /*#__PURE__*/ jsxRuntime.jsx(ResponsiveGridItem, {
                                    col: size,
                                    s: 12,
                                    xs: 12,
                                    direction: "column",
                                    alignItems: "stretch",
                                    children: /*#__PURE__*/ jsxRuntime.jsx(InputRenderer.InputRenderer, {
                                        ...field,
                                        label: getLabel(field.name, field.label),
                                        document: document
                                    })
                                }, field.name);
                            })
                        }, gridRowIndex);
                    })
                })
            }, index);
        })
    });
};

exports.FormLayout = FormLayout;
exports.ResponsiveGridItem = ResponsiveGridItem;
exports.ResponsiveGridRoot = ResponsiveGridRoot;
//# sourceMappingURL=FormLayout.js.map
